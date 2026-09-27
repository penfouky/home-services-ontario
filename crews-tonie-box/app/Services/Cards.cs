using System.Collections.Concurrent;
using System.Text.RegularExpressions;
using TonieFile;

namespace CrewsTonieBox.Services;

public class Card
{
    public string Id { get; init; }
    public string Name { get; init; }
    public string Root { get; init; }
    public string Content { get; init; }
    public long TotalBytes { get; set; }
    public long FreeBytes { get; set; }
    /* a mounted drive that can be ejected, rather than a folder on the Mac */
    public bool Removable { get; init; }
    public bool Manual { get; init; }
}

public class TonieItem
{
    public string CardId { get; set; }
    public string Uid { get; set; }
    public string UidPretty { get; set; }
    public string TagName { get; set; }
    public string Folder { get; set; }
    public string File { get; set; }
    public string Path { get; set; }
    public long Size { get; set; }
    public DateTime Modified { get; set; }
    public uint AudioId { get; set; }
    public string Hash { get; set; }
    public int Chapters { get; set; }
    public double Seconds { get; set; }
    /* official, custom, creative, system, mystery, broken */
    public string Kind { get; set; }
    public bool ExactMatch { get; set; }
    public string Title { get; set; }
    public string Series { get; set; }
    public string Episode { get; set; }
    public string Image { get; set; }
    public string Language { get; set; }
    public string Web { get; set; }
    public List<string> ChapterTitles { get; set; } = new();
    public string Emoji { get; set; }
    public string Color { get; set; }
    public string Problem { get; set; }

    public TonieItem Clone() => (TonieItem)MemberwiseClone();
}

public partial class Cards
{
    [GeneratedRegex("^[0-9A-Fa-f]{8}$")]
    private static partial Regex Hex8();

    private readonly TonieDb db;
    private readonly Library library;
    private readonly List<string> manualRoots = new();
    private readonly List<string> testRoots;
    private readonly ConcurrentDictionary<string, (long Size, DateTime Modified, TonieItem Item)> cache = new();

    public Cards(TonieDb db, Library library, IEnumerable<string> testRoots)
    {
        this.db = db;
        this.library = library;
        this.testRoots = testRoots.ToList();
    }

    public static string CardId(string root) => Convert.ToHexString(System.Security.Cryptography.SHA1.HashData(System.Text.Encoding.UTF8.GetBytes(Path.GetFullPath(root))))[..12];

    public void AddFolder(string folder)
    {
        lock (manualRoots)
        {
            if (!manualRoots.Contains(folder))
            {
                manualRoots.Add(folder);
            }
        }
    }

    public void RemoveFolder(string folder)
    {
        lock (manualRoots)
        {
            manualRoots.Remove(folder);
        }
    }

    /* mounted drives with a CONTENT folder, folders added by hand and test folders */
    public List<Card> Find()
    {
        var roots = new List<(string Root, bool Removable, bool Manual)>();
        foreach (string dir in MountPoints())
        {
            roots.Add((dir, true, false));
        }
        lock (manualRoots)
        {
            roots.AddRange(manualRoots.Select(r => (r, false, true)));
        }
        roots.AddRange(testRoots.Select(r => (r, false, false)));

        var cards = new List<Card>();
        foreach (var (root, removable, manual) in roots)
        {
            string content = ContentFolder(root);
            if (content == null)
            {
                continue;
            }
            var card = new Card
            {
                Id = CardId(root),
                Name = Path.GetFileName(root.TrimEnd('/')) is { Length: > 0 } name ? name : root,
                Root = root,
                Content = content,
                Removable = removable,
                Manual = manual
            };
            try
            {
                var drive = new DriveInfo(root);
                card.TotalBytes = drive.TotalSize;
                card.FreeBytes = drive.AvailableFreeSpace;
            }
            catch (Exception)
            {
            }
            if (!cards.Any(c => c.Id == card.Id))
            {
                cards.Add(card);
            }
        }
        return cards;
    }

    private static IEnumerable<string> MountPoints()
    {
        var bases = new List<string>();
        if (AppInfo.IsMac)
        {
            bases.Add("/Volumes");
        }
        else
        {
            string user = Environment.UserName;
            bases.AddRange(new[] { "/media/" + user, "/run/media/" + user, "/media", "/mnt" });
        }
        foreach (string dir in bases.Where(Directory.Exists))
        {
            string[] entries;
            try
            {
                entries = Directory.GetDirectories(dir);
            }
            catch (Exception)
            {
                continue;
            }
            foreach (string entry in entries)
            {
                /* skip the link to the Mac's own disk */
                if (new DirectoryInfo(entry).LinkTarget != null)
                {
                    continue;
                }
                yield return entry;
            }
        }
    }

    /* the CONTENT folder of a Toniebox card, or the folder itself if it is one */
    public static string ContentFolder(string root)
    {
        try
        {
            if (!Directory.Exists(root))
            {
                return null;
            }
            if (Path.GetFileName(root.TrimEnd('/')).Equals("CONTENT", StringComparison.OrdinalIgnoreCase))
            {
                return root;
            }
            return Directory.GetDirectories(root).FirstOrDefault(d => Path.GetFileName(d).Equals("CONTENT", StringComparison.OrdinalIgnoreCase));
        }
        catch (Exception)
        {
            return null;
        }
    }

    public Card Get(string cardId) => Find().FirstOrDefault(c => c.Id == cardId);

    public List<TonieItem> List(Card card)
    {
        var items = new List<TonieItem>();
        string[] folders;
        try
        {
            folders = Directory.GetDirectories(card.Content);
        }
        catch (Exception)
        {
            return items;
        }
        foreach (string folder in folders.Where(f => Hex8().IsMatch(Path.GetFileName(f))))
        {
            IEnumerable<string> files;
            try
            {
                files = Directory.GetFiles(folder).Where(f => Hex8().IsMatch(Path.GetFileName(f)));
            }
            catch (Exception)
            {
                continue;
            }
            foreach (string file in files)
            {
                items.Add(Describe(card, file));
            }
        }
        return items.OrderBy(i => i.Kind == "custom" ? 0 : 1).ThenBy(i => i.Title, StringComparer.CurrentCultureIgnoreCase).ToList();
    }

    public TonieItem Find(Card card, string uid)
    {
        var (folder, file) = Uid.ContentPath(uid);
        string path = Path.Combine(card.Content, folder, file);
        if (!System.IO.File.Exists(path))
        {
            /* FAT is case insensitive on the Mac, but not when testing on Linux */
            path = Directory.Exists(card.Content)
                ? Directory.EnumerateDirectories(card.Content).Where(d => Path.GetFileName(d).Equals(folder, StringComparison.OrdinalIgnoreCase))
                    .SelectMany(Directory.EnumerateFiles).FirstOrDefault(f => Path.GetFileName(f).Equals(file, StringComparison.OrdinalIgnoreCase))
                : null;
        }
        return path == null ? null : Describe(card, path);
    }

    public TonieItem Describe(Card card, string path)
    {
        var info = new FileInfo(path);
        string key = info.FullName;
        TonieItem item;
        if (cache.TryGetValue(key, out var cached) && cached.Size == info.Length && cached.Modified == info.LastWriteTimeUtc)
        {
            item = cached.Item;
        }
        else
        {
            item = ReadItem(info);
            cache[key] = (info.Length, info.LastWriteTimeUtc, item);
        }
        return Identify(card, item);
    }

    private static TonieItem ReadItem(FileInfo info)
    {
        string folder = Path.GetFileName(info.DirectoryName);
        var item = new TonieItem
        {
            Folder = folder.ToUpperInvariant(),
            File = info.Name.ToUpperInvariant(),
            Path = info.FullName,
            Size = info.Length,
            Modified = info.LastWriteTime,
            Uid = Uid.FromContentPath(folder, info.Name)
        };
        item.UidPretty = Uid.Pretty(item.Uid);
        try
        {
            var audio = TonieAudio.FromHeader(info.FullName, out double seconds);
            item.AudioId = audio.Header.AudioId;
            item.Hash = Convert.ToHexString(audio.Header.Hash ?? Array.Empty<byte>());
            item.Chapters = audio.Header.AudioChapters?.Length ?? 0;
            item.Seconds = seconds;
            if (audio.Header.AudioLength + 0x1000 != info.Length)
            {
                /* e.g. a download the box did not finish, it fetches it again when online */
                item.Problem = "incomplete";
            }
        }
        catch (Exception e)
        {
            item.Problem = "unreadable: " + e.Message;
        }
        return item;
    }

    /* names and pictures from our library and the tonies database, recomputed on every listing */
    private TonieItem Identify(Card card, TonieItem cached)
    {
        var item = cached.Clone();
        item.CardId = card.Id;
        item.TagName = library.TagName(item.Uid);
        item.ChapterTitles = new List<string>();

        if (item.Problem != null && item.Problem != "incomplete")
        {
            item.Kind = "broken";
            item.Title = "Needs a little help";
            return item;
        }

        var custom = library.Find(item.Hash);
        var (entry, exact) = db.Find(item.Hash, item.AudioId);

        /* made with this app (it knows the chapters), or named by the user and not in the database */
        if (custom != null && (entry == null || custom.Chapters.Count > 0))
        {
            item.Kind = "custom";
            item.Title = custom.Title ?? "My tonie";
            item.Emoji = custom.Emoji;
            item.Color = custom.Color;
            item.ChapterTitles = custom.Chapters.ToList();
        }
        else if (entry != null)
        {
            string category = entry.Category?.ToLowerInvariant() ?? "";
            item.Kind = category.Contains("creative") ? "creative" : category == "system" ? "system" : "official";
            item.ExactMatch = exact;
            item.Title = custom?.Title ?? entry.Title;
            item.Series = entry.Series;
            item.Episode = entry.Episode;
            item.Image = entry.Image;
            item.Language = entry.Language;
            item.Web = entry.Web;
            item.Emoji = custom?.Emoji;
            item.ChapterTitles = entry.Tracks.ToList();
        }
        else if (item.AudioId < 0x50000000)
        {
            /* teddy and this app give home-made tonies ids below 0x50000000 */
            item.Kind = "custom";
            item.Title = custom?.Title ?? "A home-made tonie";
            item.Emoji = custom?.Emoji;
            item.Color = custom?.Color;
        }
        else
        {
            item.Kind = "mystery";
            item.Title = custom?.Title ?? "Mystery tonie";
            item.Emoji = custom?.Emoji;
        }

        /* a photo the user picked wins over the emoji and the shop picture */
        if (custom?.Picture != null && item.Hash != null)
        {
            item.Image = "/api/cover/" + item.Hash;
            item.Emoji = null;
        }

        if (item.ChapterTitles.Count != item.Chapters)
        {
            /* chapter names only help when they match the file */
            item.ChapterTitles = item.ChapterTitles.Count > item.Chapters ? item.ChapterTitles.Take(item.Chapters).ToList() : item.ChapterTitles;
        }
        return item;
    }

    public void Forget(string path) => cache.TryRemove(Path.GetFullPath(path), out _);
}
