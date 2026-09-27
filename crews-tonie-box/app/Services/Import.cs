using System.Text.Json;
using TonieFile;

namespace CrewsTonieBox.Services;

/* free, public-domain audio brought straight into a tonie: LibriVox audiobooks (archive.org).
   No copyrighted or ripped tonie content: downloads are limited to LibriVox/archive.org. */
public class Import
{
    public record Book(string Id, string Title, string Author, int Sections, double Seconds);
    public record ImportTrack(string Title, string Url, double Seconds);

    private readonly HttpClient http;
    private readonly Staging staging;
    private readonly string apiBase;
    private readonly HashSet<string> allowedHosts;

    public Import(HttpClient http, Staging staging)
    {
        this.http = http;
        this.staging = staging;
        /* overridable so the tests can point at a local mock */
        apiBase = (Environment.GetEnvironmentVariable("CTB_LIBRIVOX_API") ?? "https://librivox.org/api/feed").TrimEnd('/');
        allowedHosts = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "librivox.org", "archive.org", "www.archive.org", "ia800000.us.archive.org" };
        foreach (string host in (Environment.GetEnvironmentVariable("CTB_IMPORT_HOSTS") ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            allowedHosts.Add(host);
        }
    }

    public bool Enabled => true;

    /* downloads only from archive.org / librivox (or an *.archive.org mirror) */
    private bool Allowed(Uri uri) =>
        uri.Scheme is "http" or "https" && (allowedHosts.Contains(uri.Host) || uri.Host.EndsWith(".archive.org", StringComparison.OrdinalIgnoreCase));

    public async Task<List<Book>> SearchAsync(string query, CancellationToken cancel)
    {
        query = (query ?? "").Trim();
        if (query.Length == 0)
        {
            return new List<Book>();
        }
        /* by title, then by author if nothing came back */
        var books = await FetchBooksAsync("title", query, cancel);
        if (books.Count == 0)
        {
            books = await FetchBooksAsync("author", query, cancel);
        }
        return books;
    }

    private async Task<List<Book>> FetchBooksAsync(string field, string query, CancellationToken cancel)
    {
        string url = $"{apiBase}/audiobooks/?{field}={Uri.EscapeDataString(query)}&format=json&limit=24";
        var result = new List<Book>();
        try
        {
            using var doc = await GetJsonAsync(url, cancel);
            if (!doc.RootElement.TryGetProperty("books", out var list) || list.ValueKind != JsonValueKind.Array)
            {
                return result;
            }
            foreach (var book in list.EnumerateArray())
            {
                result.Add(new Book(
                    Str(book, "id"),
                    Str(book, "title") ?? "Untitled",
                    Authors(book),
                    (int)Num(book, "num_sections"),
                    Num(book, "totaltimesecs")));
            }
        }
        catch (Exception)
        {
            /* a bad response just means no results */
        }
        return result;
    }

    public async Task<List<ImportTrack>> TracksAsync(string projectId, CancellationToken cancel)
    {
        string url = $"{apiBase}/audiotracks/?project_id={Uri.EscapeDataString(projectId)}&format=json";
        var tracks = new List<ImportTrack>();
        using var doc = await GetJsonAsync(url, cancel);
        if (!doc.RootElement.TryGetProperty("sections", out var sections) || sections.ValueKind != JsonValueKind.Array)
        {
            return tracks;
        }
        foreach (var section in sections.EnumerateArray())
        {
            string listen = Str(section, "listen_url");
            if (!string.IsNullOrEmpty(listen) && Uri.TryCreate(listen, UriKind.Absolute, out var uri) && Allowed(uri))
            {
                tracks.Add(new ImportTrack(Str(section, "title") ?? "Chapter", listen, Num(section, "playtime")));
            }
        }
        return tracks;
    }

    /* downloads one track and stages it as a source for a new tonie */
    public async Task<StagedFile> StageTrackAsync(string rawUrl, string title, CancellationToken cancel)
    {
        if (!Uri.TryCreate(rawUrl, UriKind.Absolute, out var uri) || !Allowed(uri))
        {
            throw new InvalidOperationException("That download is not from LibriVox, so it was not fetched.");
        }
        using var response = await http.GetAsync(uri, HttpCompletionOption.ResponseHeadersRead, cancel);
        response.EnsureSuccessStatusCode();
        long? length = response.Content.Headers.ContentLength;
        if (length > 300L << 20)
        {
            throw new InvalidOperationException("That track is unusually large, so it was skipped.");
        }
        string ext = Path.GetExtension(uri.AbsolutePath);
        if (!AudioInput.IsSupported("x" + ext))
        {
            ext = ".mp3";
        }
        await using var stream = await response.Content.ReadAsStreamAsync(cancel);
        return await staging.UploadNamedAsync(stream, (title ?? "Chapter") + ext, title, cancel);
    }

    private async Task<JsonDocument> GetJsonAsync(string url, CancellationToken cancel)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || !(uri.Scheme is "http" or "https"))
        {
            throw new InvalidOperationException("bad url");
        }
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancel);
        timeout.CancelAfter(TimeSpan.FromSeconds(20));
        byte[] json = await http.GetByteArrayAsync(uri, timeout.Token);
        return JsonDocument.Parse(json);
    }

    private static string Authors(JsonElement book)
    {
        if (book.TryGetProperty("authors", out var authors) && authors.ValueKind == JsonValueKind.Array)
        {
            var names = authors.EnumerateArray()
                .Select(a => string.Join(" ", new[] { Str(a, "first_name"), Str(a, "last_name") }.Where(s => !string.IsNullOrWhiteSpace(s))))
                .Where(s => s.Length > 0)
                .ToList();
            if (names.Count > 0)
            {
                return string.Join(", ", names);
            }
        }
        return "";
    }

    private static string Str(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) ? (value.ValueKind == JsonValueKind.String ? value.GetString() : value.ValueKind == JsonValueKind.Number ? value.ToString() : null) : null;

    private static double Num(JsonElement element, string name)
    {
        if (!element.TryGetProperty(name, out var value))
        {
            return 0;
        }
        if (value.ValueKind == JsonValueKind.Number)
        {
            return value.GetDouble();
        }
        return value.ValueKind == JsonValueKind.String && double.TryParse(value.GetString(), out double n) ? n : 0;
    }
}
