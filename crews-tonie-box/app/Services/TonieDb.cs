using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace CrewsTonieBox.Services;

public class TonieEntry
{
    public string Article { get; init; }
    public string Series { get; init; }
    public string Episode { get; init; }
    public string Language { get; init; }
    public string Category { get; init; }
    public int Runtime { get; init; }
    public int Age { get; init; }
    public string Image { get; init; }
    public string Web { get; init; }
    public List<string> Tracks { get; init; } = new();

    public string Title => string.IsNullOrWhiteSpace(Episode) || Episode == Series ? Series : $"{Series} – {Episode}";
}

/* the community-maintained tonies.json: names, pictures and chapter titles of the official tonies */
public class TonieDb
{
    public const string UpdateUrl = "https://raw.githubusercontent.com/toniebox-reverse-engineering/tonies-json/release/toniesV2.json";

    private readonly AppPaths paths;
    private readonly HttpClient http;
    private Dictionary<string, TonieEntry> byHash = new();
    private Dictionary<uint, List<TonieEntry>> byAudioId = new();
    private HashSet<string> images = new();
    private List<TonieEntry> catalog = new();

    public int Count { get; private set; }
    public string Source { get; private set; }
    public DateTime? Loaded { get; private set; }

    public TonieDb(AppPaths paths, HttpClient http)
    {
        this.paths = paths;
        this.http = http;
        Load();
    }

    private string DownloadedFile => Path.Combine(paths.Data, "toniesV2.json");

    private void Load()
    {
        try
        {
            if (File.Exists(DownloadedFile))
            {
                Index(File.ReadAllBytes(DownloadedFile));
                Source = "downloaded " + File.GetLastWriteTime(DownloadedFile).ToString("yyyy-MM-dd");
                return;
            }
        }
        catch (Exception)
        {
            /* fall back to the snapshot below */
        }

        byte[] builtIn = BuiltIn();
        if (builtIn == null)
        {
            Source = "none";
            return;
        }
        Index(builtIn);
        Source = "built in";
    }

    /* the snapshot of the list made when the app was built */
    private static byte[] BuiltIn()
    {
        using var resource = typeof(TonieDb).Assembly.GetManifestResourceStream("toniesV2.json.gz");
        if (resource == null)
        {
            return null;
        }
        using var gzip = new GZipStream(resource, CompressionMode.Decompress);
        using var memory = new MemoryStream();
        gzip.CopyTo(memory);
        return memory.ToArray();
    }

    public static int BuiltInCount()
    {
        byte[] json = BuiltIn();
        if (json == null)
        {
            return 0;
        }
        using var doc = JsonDocument.Parse(json);
        return doc.RootElement.EnumerateArray().Sum(article => article.TryGetProperty("data", out var data) && data.ValueKind == JsonValueKind.Array ? data.GetArrayLength() : 0);
    }

    private void Index(byte[] json)
    {
        var hashes = new Dictionary<string, TonieEntry>();
        var ids = new Dictionary<uint, List<TonieEntry>>();
        var pictures = new HashSet<string>();
        var entries = new List<TonieEntry>();
        int count = 0;

        using var doc = JsonDocument.Parse(json);
        foreach (var article in doc.RootElement.EnumerateArray())
        {
            string articleNo = Str(article, "article");
            if (!article.TryGetProperty("data", out var data))
            {
                continue;
            }
            foreach (var item in data.EnumerateArray())
            {
                var entry = new TonieEntry
                {
                    Article = articleNo,
                    Series = Str(item, "series") ?? "",
                    Episode = Str(item, "episode"),
                    Language = Str(item, "language"),
                    Category = Str(item, "category"),
                    Runtime = Int(item, "runtime"),
                    Age = Int(item, "age"),
                    Image = Str(item, "image"),
                    Web = Str(item, "web"),
                    Tracks = item.TryGetProperty("track-desc", out var tracks) && tracks.ValueKind == JsonValueKind.Array
                        ? tracks.EnumerateArray().Select(t => t.ToString()).ToList() : new List<string>()
                };
                count++;
                if (!string.IsNullOrEmpty(entry.Image))
                {
                    pictures.Add(entry.Image);
                }
                /* the browsable catalog: named items only, so "coming soon" blanks are skipped */
                if (!string.IsNullOrWhiteSpace(entry.Series))
                {
                    entries.Add(entry);
                }
                if (!item.TryGetProperty("ids", out var idList) || idList.ValueKind != JsonValueKind.Array)
                {
                    continue;
                }
                foreach (var id in idList.EnumerateArray())
                {
                    string hash = Str(id, "hash")?.ToUpperInvariant();
                    if (!string.IsNullOrEmpty(hash))
                    {
                        hashes.TryAdd(hash, entry);
                    }
                    if (id.TryGetProperty("audio-id", out var audioId) && audioId.TryGetUInt32(out uint value))
                    {
                        if (!ids.TryGetValue(value, out var list))
                        {
                            ids[value] = list = new List<TonieEntry>();
                        }
                        list.Add(entry);
                    }
                }
            }
        }

        entries.Sort((a, b) =>
        {
            int series = string.Compare(a.Series, b.Series, StringComparison.CurrentCultureIgnoreCase);
            return series != 0 ? series : string.Compare(a.Episode ?? "", b.Episode ?? "", StringComparison.CurrentCultureIgnoreCase);
        });
        byHash = hashes;
        byAudioId = ids;
        images = pictures;
        catalog = entries;
        Count = count;
        Loaded = DateTime.Now;
    }

    public record CatalogResult(int Total, List<TonieEntry> Items);

    /* the browsable official catalog, filtered by a search and language, paged */
    public CatalogResult SearchCatalog(string query, string language, int offset, int limit)
    {
        IEnumerable<TonieEntry> found = catalog;
        if (!string.IsNullOrWhiteSpace(language))
        {
            found = found.Where(e => string.Equals(e.Language, language, StringComparison.OrdinalIgnoreCase));
        }
        query = (query ?? "").Trim();
        if (query.Length > 0)
        {
            found = found.Where(e =>
                Has(e.Series, query) || Has(e.Episode, query) || Has(e.Article, query) ||
                e.Tracks.Any(t => Has(t, query)));
        }
        var list = found.ToList();
        return new CatalogResult(list.Count, list.Skip(Math.Max(0, offset)).Take(Math.Clamp(limit, 1, 200)).ToList());
    }

    /* languages present in the catalog, most common first, for the filter */
    public List<object> Languages() =>
        catalog.Where(e => !string.IsNullOrWhiteSpace(e.Language))
            .GroupBy(e => e.Language)
            .OrderByDescending(g => g.Count())
            .Select(g => (object)new { language = g.Key, count = g.Count() })
            .ToList();

    private static bool Has(string haystack, string needle) =>
        haystack != null && haystack.Contains(needle, StringComparison.OrdinalIgnoreCase);

    private static string Str(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;

    private static int Int(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out int number) ? number : 0;

    /* an exact match by content hash, else a tonie that used this audio id (possibly another version) */
    public (TonieEntry Entry, bool Exact) Find(string hash, uint audioId)
    {
        if (hash != null && byHash.TryGetValue(hash.ToUpperInvariant(), out var exact))
        {
            return (exact, true);
        }
        if (byAudioId.TryGetValue(audioId, out var list) && list.Count > 0)
        {
            return (list[0], false);
        }
        return (null, false);
    }

    public async Task<string> UpdateAsync(CancellationToken cancel = default)
    {
        byte[] json = await http.GetByteArrayAsync(UpdateUrl, cancel);
        /* only keep it if it parses */
        Index(json);
        await File.WriteAllBytesAsync(DownloadedFile, json, cancel);
        Source = "downloaded " + DateTime.Now.ToString("yyyy-MM-dd");
        return Source;
    }

    public bool IsKnownImage(string url) => url != null && images.Contains(url);

    /* official tonie pictures, downloaded once and kept for offline use */
    public async Task<string> ImageFileAsync(string url, CancellationToken cancel = default)
    {
        if (!IsKnownImage(url))
        {
            return null;
        }
        string dir = Path.Combine(paths.Cache, "images");
        Directory.CreateDirectory(dir);
        string name = Convert.ToHexString(SHA1.HashData(Encoding.UTF8.GetBytes(url)));
        string file = Directory.EnumerateFiles(dir, name + ".*").FirstOrDefault();
        if (file != null)
        {
            return file;
        }
        if (failed.TryGetValue(url, out var when) && when > DateTime.Now.AddMinutes(-10))
        {
            /* offline: do not ask again for every card on every refresh */
            return null;
        }

        using var response = await SafeGetAsync(url, cancel);
        if (response is not { IsSuccessStatusCode: true })
        {
            failed[url] = DateTime.Now;
            return null;
        }
        string ext = response.Content.Headers.ContentType?.MediaType switch
        {
            "image/png" => ".png",
            "image/webp" => ".webp",
            "image/gif" => ".gif",
            _ => ".jpg"
        };
        file = Path.Combine(dir, name + ext);
        /* two cards can ask for the same picture at once */
        string temp = Path.Combine(dir, "~" + Guid.NewGuid().ToString("N"));
        await File.WriteAllBytesAsync(temp, await response.Content.ReadAsByteArrayAsync(cancel), cancel);
        File.Move(temp, file, true);
        return file;
    }

    private readonly System.Collections.Concurrent.ConcurrentDictionary<string, DateTime> failed = new();

    private async Task<HttpResponseMessage> SafeGetAsync(string url, CancellationToken cancel)
    {
        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancel);
            timeout.CancelAfter(TimeSpan.FromSeconds(15));
            return await http.GetAsync(url, timeout.Token);
        }
        catch (Exception) when (!cancel.IsCancellationRequested)
        {
            return null;
        }
    }
}
