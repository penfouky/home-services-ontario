using System.Collections.Concurrent;
using System.Diagnostics;
using Photino.NET;
using TonieFile;

namespace CrewsTonieBox.Services;

public class Options
{
    public bool NoWindow { get; set; }
    public bool OpenBrowser { get; set; }
    public bool Dev { get; set; }
    public bool Version { get; set; }
    public int Port { get; set; }
    public string DataDir { get; set; }
    public List<string> SdRoots { get; } = new();

    public static Options Parse(string[] args)
    {
        var options = new Options();
        for (int i = 0; i < args.Length; i++)
        {
            switch (args[i])
            {
                case "--no-window": options.NoWindow = true; break;
                case "--browser": options.OpenBrowser = true; break;
                case "--dev": options.Dev = true; break;
                case "--version": options.Version = true; break;
                case "--port": options.Port = int.Parse(args[++i]); break;
                case "--data": options.DataDir = args[++i]; break;
                case "--sd-root": options.SdRoots.Add(args[++i]); break;
            }
        }
        return options;
    }
}

/* native dialogs of the app window, when there is one */
public class WindowBridge
{
    public PhotinoWindow Window { get; set; }
    public bool HasDialogs => Window != null;

    public async Task<string[]> PickFilesAsync()
    {
        if (Window == null)
        {
            return null;
        }
        var filters = new[] { ("Audio", AudioInput.Extensions.Select(e => "*" + e).ToArray()) };
        return await Window.ShowOpenFileAsync("Choose stories and songs", null, true, filters);
    }

    public async Task<string> PickFolderAsync(string title)
    {
        if (Window == null)
        {
            return null;
        }
        return (await Window.ShowOpenFolderAsync(title, null, false))?.FirstOrDefault();
    }
}

public static class Desktop
{
    public static void Open(string target)
    {
        try
        {
            Process.Start(new ProcessStartInfo(AppInfo.IsMac ? "open" : "xdg-open", target) { UseShellExecute = false });
        }
        catch (Exception)
        {
        }
    }

    public static bool Reveal(string path)
    {
        if (AppInfo.IsMac)
        {
            return AudioTools.Run("/usr/bin/open", new[] { "-R", path }, out _);
        }
        Open(Directory.Exists(path) ? path : Path.GetDirectoryName(path));
        return true;
    }

    public static (bool Ok, string Message) Eject(Card card)
    {
        if (!AppInfo.IsMac || !card.Removable)
        {
            return (false, "Ejecting only works for SD cards on a Mac.");
        }
        bool ok = AudioTools.Run("/usr/sbin/diskutil", new[] { "eject", card.Root }, out string output);
        return (ok, ok ? "You can take the SD card out now." : "The card is still busy: " + output.Trim());
    }
}

/* listening to chapters in the app: Ogg where the web view plays it, else WAV decoded while it plays */
public class Previews
{
    private readonly object sync = new();
    /* the last few tonies listened to, parsed (a long tonie is read once, not for every range request) */
    private readonly LinkedList<(string Key, TonieStream Stream)> recent = new();
    private readonly ConcurrentDictionary<string, List<double>> chapterSeconds = new();

    public TonieStream Stream(string tonieFile)
    {
        var info = new FileInfo(tonieFile);
        string key = $"{info.FullName}|{info.Length}|{info.LastWriteTimeUtc.Ticks}";
        lock (sync)
        {
            for (var node = recent.First; node != null; node = node.Next)
            {
                if (node.Value.Key == key)
                {
                    recent.Remove(node);
                    recent.AddFirst(node);
                    return node.Value.Stream;
                }
            }
        }
        var stream = TonieAudio.FromFile(tonieFile).GetStream();
        lock (sync)
        {
            recent.AddFirst((key, stream));
            while (recent.Count > 3)
            {
                recent.RemoveLast();
            }
        }
        return stream;
    }

    public IResult Ogg(string tonieFile, int chapter, string title)
    {
        var stream = Stream(tonieFile);
        if (chapter < 0 || chapter >= stream.Chapters.Count)
        {
            return Results.NotFound();
        }
        return Results.Bytes(stream.ExtractOgg(chapter, new[] { "TITLE=" + title }), "audio/ogg", enableRangeProcessing: true);
    }

    /* WAV with range requests (WebKit asks for those), decoded for just the bytes asked for */
    public async Task WavAsync(HttpContext http, string tonieFile, int chapter)
    {
        var response = http.Response;
        var stream = Stream(tonieFile);
        if (chapter < 0 || chapter >= stream.Chapters.Count)
        {
            response.StatusCode = 404;
            return;
        }
        long total = stream.WavLength(chapter);
        long from = 0, to = total - 1;
        string range = http.Request.Headers.Range;
        response.Headers.AcceptRanges = "bytes";
        response.ContentType = "audio/wav";
        if (!string.IsNullOrEmpty(range))
        {
            if (!TryParseRange(range, total, out from, out to))
            {
                response.StatusCode = 416;
                response.Headers.ContentRange = $"bytes */{total}";
                return;
            }
            response.StatusCode = 206;
            response.Headers.ContentRange = $"bytes {from}-{to}/{total}";
        }
        response.ContentLength = to - from + 1;
        if (HttpMethods.IsHead(http.Request.Method))
        {
            return;
        }
        try
        {
            foreach (var chunk in stream.WavRange(chapter, from, to - from + 1))
            {
                await response.Body.WriteAsync(chunk, http.RequestAborted);
            }
        }
        catch (OperationCanceledException)
        {
            /* the player jumped somewhere else or stopped */
        }
        catch (IOException)
        {
        }
    }

    /* "bytes=a-b", "bytes=a-" or "bytes=-n", the first range only */
    public static bool TryParseRange(string header, long total, out long from, out long to)
    {
        from = 0;
        to = total - 1;
        if (!header.StartsWith("bytes=", StringComparison.OrdinalIgnoreCase) || total <= 0)
        {
            return false;
        }
        string first = header[6..].Split(',')[0].Trim();
        int dash = first.IndexOf('-');
        if (dash < 0)
        {
            return false;
        }
        string a = first[..dash].Trim(), b = first[(dash + 1)..].Trim();
        if (a.Length == 0)
        {
            if (!long.TryParse(b, out long suffix) || suffix <= 0)
            {
                return false;
            }
            from = Math.Max(0, total - suffix);
            return true;
        }
        if (!long.TryParse(a, out from) || from >= total)
        {
            return false;
        }
        if (b.Length > 0)
        {
            if (!long.TryParse(b, out to) || to < from)
            {
                return false;
            }
            to = Math.Min(to, total - 1);
        }
        return true;
    }

    /* reading a whole tonie takes a moment, so remember the chapter lengths */
    public List<double> ChapterSeconds(string tonieFile, string hash)
    {
        return chapterSeconds.GetOrAdd(hash ?? tonieFile, _ => Stream(tonieFile).Chapters.Select(c => Math.Round(c.Seconds, 1)).ToList());
    }
}
