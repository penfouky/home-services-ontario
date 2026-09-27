using System.Collections.Concurrent;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;
using TonieFile;

namespace CrewsTonieBox.Services;

public class Job
{
    public string Id { get; } = Guid.NewGuid().ToString("N")[..12];
    public string Kind { get; init; }
    public string Title { get; init; }
    /* running, done, failed, cancelled */
    public string State { get; set; } = "running";
    public double Progress { get; set; }
    public string Step { get; set; }
    public string Error { get; set; }
    public object Result { get; set; }
    public DateTime Started { get; } = DateTime.Now;
    public DateTime? Finished { get; set; }

    [JsonIgnore]
    public CancellationTokenSource Cancel { get; } = new();
}

public class Jobs
{
    private readonly ConcurrentDictionary<string, Job> jobs = new();

    public Job Start(string kind, string title, Func<Job, Task<object>> work)
    {
        var job = new Job { Kind = kind, Title = title };
        jobs[job.Id] = job;
        _ = Task.Run(async () =>
        {
            try
            {
                job.Result = await work(job);
                job.Progress = 1;
                job.State = "done";
            }
            catch (Exception) when (job.Cancel.IsCancellationRequested)
            {
                job.State = "cancelled";
            }
            catch (Exception e)
            {
                job.Error = Friendly(e);
                job.State = "failed";
                AppLog.Write($"{kind} \"{title}\" failed: {e}");
            }
            job.Finished = DateTime.Now;
        });
        return job;
    }

    public Job Get(string id) => jobs.TryGetValue(id, out var job) ? job : null;

    public bool Busy(string kind = null) => jobs.Values.Any(j => j.State == "running" && (kind == null || j.Kind == kind));

    private static string Friendly(Exception e) => e switch
    {
        UnauthorizedAccessException => "The card is locked or read-only. Check the little lock switch on the SD card.",
        IOException io when io.Message.Contains("No space", StringComparison.OrdinalIgnoreCase) => "There is not enough room on the card.",
        _ => e.Message
    };
}

/* a picked or dropped audio file, waiting to become a chapter */
public class StagedFile
{
    public string Id { get; init; }
    public string Name { get; init; }
    public string Title { get; set; }
    public string Artist { get; set; }
    public int Track { get; set; }
    public double Seconds { get; set; }
    public long Size { get; set; }

    [JsonIgnore]
    public string Path { get; init; }
}

public class Staging
{
    private readonly AppPaths paths;
    private readonly ConcurrentDictionary<string, StagedFile> files = new();

    public Staging(AppPaths paths)
    {
        this.paths = paths;
    }

    public StagedFile Add(string path)
    {
        var info = AudioInput.Probe(path);
        var staged = new StagedFile
        {
            Id = Guid.NewGuid().ToString("N")[..12],
            Name = System.IO.Path.GetFileName(path),
            Path = path,
            Title = info.Title,
            Artist = info.Artist,
            Track = info.Track,
            Seconds = info.Seconds,
            Size = new FileInfo(path).Length
        };
        files[staged.Id] = staged;
        return staged;
    }

    public async Task<StagedFile> UploadAsync(string name, Stream body, CancellationToken cancel)
    {
        string safe = string.Concat(System.IO.Path.GetFileName(name ?? "audio").Split(System.IO.Path.GetInvalidFileNameChars()));
        string dir = System.IO.Path.Combine(paths.Temp, "uploads", Guid.NewGuid().ToString("N")[..12]);
        Directory.CreateDirectory(dir);
        string file = System.IO.Path.Combine(dir, string.IsNullOrWhiteSpace(safe) ? "audio" : safe);
        await using (var output = File.Create(file))
        {
            await body.CopyToAsync(output, cancel);
        }
        return Add(file);
    }

    /* a chapter pulled out of an existing tonie, ready to go into a new one */
    public StagedFile AddOgg(byte[] ogg, string title, string name, double seconds)
    {
        string dir = System.IO.Path.Combine(paths.Temp, "imported", Guid.NewGuid().ToString("N")[..12]);
        Directory.CreateDirectory(dir);
        string safe = string.Concat((name ?? "chapter").Split(System.IO.Path.GetInvalidFileNameChars())).Trim();
        string file = System.IO.Path.Combine(dir, (safe.Length > 0 ? safe : "chapter") + ".ogg");
        File.WriteAllBytes(file, ogg);
        var staged = Add(file);
        if (!string.IsNullOrWhiteSpace(title))
        {
            staged.Title = title.Trim();
        }
        if (seconds > 0)
        {
            staged.Seconds = seconds;
        }
        return staged;
    }

    public StagedFile Get(string id) => id != null && files.TryGetValue(id, out var file) ? file : null;
}

/* photos the user picks for their own tonies: uploaded to a temp spot, then kept by content hash when a tonie is made */
public class Covers
{
    private static readonly string[] Kinds = { ".png", ".jpg", ".jpeg", ".gif", ".webp" };
    private readonly AppPaths paths;
    private readonly ConcurrentDictionary<string, (string Path, string Ext)> pending = new();

    public Covers(AppPaths paths)
    {
        this.paths = paths;
    }

    public static bool IsImage(string name) => Kinds.Contains(System.IO.Path.GetExtension(name ?? "").ToLowerInvariant());

    public async Task<object> UploadAsync(string name, Stream body, CancellationToken cancel)
    {
        string ext = System.IO.Path.GetExtension(name ?? "").ToLowerInvariant();
        if (!Kinds.Contains(ext))
        {
            throw new InvalidOperationException("Please choose a picture: PNG, JPEG, GIF or WebP.");
        }
        string dir = System.IO.Path.Combine(paths.Temp, "covers");
        Directory.CreateDirectory(dir);
        string id = Guid.NewGuid().ToString("N")[..12];
        string file = System.IO.Path.Combine(dir, id + ext);
        await using (var output = File.Create(file))
        {
            await body.CopyToAsync(output, cancel);
        }
        if (new FileInfo(file).Length > 8 << 20)
        {
            File.Delete(file);
            throw new InvalidOperationException("That picture is very large. Please pick one under 8 MB.");
        }
        pending[id] = (file, ext);
        return new { id };
    }

    /* moves a just-uploaded picture to its lasting home, named by the tonie's hash; returns the file name */
    public string Keep(string pictureId, string hash)
    {
        if (string.IsNullOrEmpty(pictureId) || hash == null || !pending.TryGetValue(pictureId, out var upload))
        {
            return null;
        }
        Clear(hash);
        string name = hash.ToUpperInvariant() + upload.Ext;
        File.Copy(upload.Path, System.IO.Path.Combine(paths.Covers, name), true);
        return name;
    }

    public string Find(string hash) =>
        hash == null ? null : Directory.EnumerateFiles(paths.Covers, hash.ToUpperInvariant() + ".*").FirstOrDefault();

    public void Clear(string hash)
    {
        foreach (string file in Directory.EnumerateFiles(paths.Covers, hash.ToUpperInvariant() + ".*"))
        {
            try
            {
                File.Delete(file);
            }
            catch (Exception)
            {
            }
        }
    }
}

/* tonie files kept on the Mac: backups and tonies saved for later, each with a .json next to it */
public class ShelfItem
{
    public string Id { get; set; }
    public string Title { get; set; }
    public string Uid { get; set; }
    public string Hash { get; set; }
    public uint AudioId { get; set; }
    public string Kind { get; set; }
    public string Reason { get; set; }
    public double Seconds { get; set; }
    public int Chapters { get; set; }
    public long Size { get; set; }
    public string Image { get; set; }
    public string Emoji { get; set; }
    public string Color { get; set; }
    public DateTime Saved { get; set; }

    [JsonIgnore]
    public string File { get; set; }
}

public class Shelf
{
    public string Folder { get; }

    public Shelf(AppPaths paths)
    {
        Folder = paths.Backups;
    }

    public List<ShelfItem> List()
    {
        var items = new List<ShelfItem>();
        foreach (string json in Directory.EnumerateFiles(Folder, "*.json"))
        {
            try
            {
                var item = JsonSerializer.Deserialize<ShelfItem>(File.ReadAllText(json), AppInfo.Json);
                item.File = Path.ChangeExtension(json, ".taf");
                if (File.Exists(item.File))
                {
                    items.Add(item);
                }
            }
            catch (Exception)
            {
            }
        }
        return items.OrderByDescending(i => i.Saved).ToList();
    }

    public ShelfItem Get(string id) => List().FirstOrDefault(i => i.Id == id);

    public ShelfItem FindByHash(string hash) => List().FirstOrDefault(i => i.Hash == hash);

    public ShelfItem Add(string sourceFile, TonieItem tonie, string reason)
    {
        var existing = tonie.Hash != null ? FindByHash(tonie.Hash) : null;
        if (existing != null)
        {
            return existing;
        }
        string safe = string.Concat((tonie.Title ?? "tonie").Split(Path.GetInvalidFileNameChars())).Trim();
        string name = $"{DateTime.Now:yyyy-MM-dd HH.mm} {safe} ({tonie.Uid ?? "no tag"})";
        string file = Path.Combine(Folder, name + ".taf");
        File.Copy(sourceFile, file + ".tmp", true);
        File.Move(file + ".tmp", file, true);
        var item = new ShelfItem
        {
            Id = Guid.NewGuid().ToString("N")[..12],
            Title = tonie.Title,
            Uid = tonie.Uid,
            Hash = tonie.Hash,
            AudioId = tonie.AudioId,
            Kind = tonie.Kind,
            Reason = reason,
            Seconds = tonie.Seconds,
            Chapters = tonie.Chapters,
            Size = new FileInfo(file).Length,
            Image = tonie.Image,
            Emoji = tonie.Emoji,
            Color = tonie.Color,
            Saved = DateTime.Now,
            File = file
        };
        File.WriteAllText(Path.ChangeExtension(file, ".json"), JsonSerializer.Serialize(item, AppInfo.Json));
        return item;
    }

    public void Delete(ShelfItem item)
    {
        File.Delete(item.File);
        File.Delete(Path.ChangeExtension(item.File, ".json"));
    }
}

public class MakeRequest
{
    public string Title { get; set; }
    public string Emoji { get; set; }
    public string Color { get; set; }
    /* an uploaded photo's id, or null for an emoji */
    public string Picture { get; set; }
    public List<MakeTrack> Tracks { get; set; } = new();
    /* where it goes: a tag on a card, or the shelf on the Mac */
    public string CardId { get; set; }
    public string Uid { get; set; }
    public bool KeepAudioId { get; set; } = true;
    public int? BitRate { get; set; }
    public bool? Vbr { get; set; }
}

public class MakeTrack
{
    public string Id { get; set; }
    public string Title { get; set; }
}

/* everything that changes tonie files */
public class Workshop
{
    private readonly AppPaths paths;
    private readonly Cards cards;
    private readonly Library library;
    private readonly Staging staging;
    private readonly Shelf shelf;
    private readonly Covers covers;
    private readonly JsonStore<Settings> settings;

    public Workshop(AppPaths paths, Cards cards, Library library, Staging staging, Shelf shelf, Covers covers, JsonStore<Settings> settings)
    {
        this.paths = paths;
        this.cards = cards;
        this.library = library;
        this.staging = staging;
        this.shelf = shelf;
        this.covers = covers;
        this.settings = settings;
    }

    private class EncodeProgress : TonieAudio.EncodeCallback
    {
        private readonly Job job;
        private readonly double[] seconds;
        private readonly double total;
        private readonly string[] titles;
        private int track;

        public EncodeProgress(Job job, double[] seconds, string[] titles)
        {
            this.job = job;
            this.seconds = seconds;
            this.titles = titles;
            total = Math.Max(1, seconds.Sum());
        }

        public override void FileStart(int track, string sourceFile)
        {
            this.track = track;
            job.Step = $"Chapter {track} of {seconds.Length}: {titles[track - 1]}";
            Report(0);
        }

        public override void Progress(decimal pct) => Report((double)pct);

        private void Report(double fraction)
        {
            job.Cancel.Token.ThrowIfCancellationRequested();
            double done = seconds.Take(track - 1).Sum() + fraction * seconds[track - 1];
            job.Progress = 0.95 * done / total;
        }

        public override void FileDone()
        {
        }

        public override void FileFailed(string message) => job.Step = message;

        public override void Failed(string message) => job.Step = message;

        public override void Warning(string message) => job.Step = message;
    }

    public async Task<object> MakeAsync(Job job, MakeRequest request)
    {
        var tracks = request.Tracks.Select(t => (Track: t, File: staging.Get(t.Id))).ToList();
        if (tracks.Count == 0)
        {
            throw new InvalidOperationException("Add at least one story or song first.");
        }
        if (tracks.Any(t => t.File == null || !File.Exists(t.File.Path)))
        {
            throw new InvalidOperationException("Some of the audio files are gone. Please add them again.");
        }

        var setup = settings.Read(s => (s.BitRate, s.Vbr, s.BackupBeforeReplace));
        int bitRate = Math.Clamp(request.BitRate ?? setup.BitRate, 32, 192);
        bool vbr = request.Vbr ?? setup.Vbr;
        string title = string.IsNullOrWhiteSpace(request.Title) ? "My tonie" : request.Title.Trim();
        string[] titles = tracks.Select(t => string.IsNullOrWhiteSpace(t.Track.Title) ? t.File.Title : t.Track.Title.Trim()).ToArray();

        Card card = null;
        string uid = null, target = null;
        TonieItem existing = null;
        if (request.CardId != null)
        {
            card = cards.Get(request.CardId) ?? throw new InvalidOperationException("The SD card is not there anymore.");
            uid = Uid.Normalize(request.Uid) ?? throw new InvalidOperationException("That tag ID does not look right. It has 16 letters and numbers, like E0:04:03:50:1E:E9:18:F2.");
            existing = cards.Find(card, uid);
            var (folder, file) = Uid.ContentPath(uid);
            target = existing?.Path ?? Path.Combine(card.Content, folder, file);
        }

        /* keeping the id of the file that was there lets an online Toniebox keep the new content (like TeddyBench's option) */
        uint audioId = request.KeepAudioId && existing != null && existing.Problem == null && existing.AudioId != 0
            ? existing.AudioId
            : (uint)(DateTimeOffset.Now.ToUnixTimeSeconds() - 0x50000000);

        job.Step = "Getting ready";
        var progress = new EncodeProgress(job, tracks.Select(t => Math.Max(1, t.File.Seconds)).ToArray(), titles);
        var audio = await Task.Run(() => new TonieAudio(tracks.Select(t => t.File.Path).ToArray(), audioId, bitRate * 1000, vbr, null, progress), job.Cancel.Token);
        string hash = Convert.ToHexString(audio.Header.Hash);

        string picture = covers.Keep(request.Picture, hash);
        library.Remember(hash, new CustomTonie { Title = title, Emoji = request.Emoji, Color = request.Color, Picture = picture, Chapters = titles.ToList(), Uid = uid });

        if (card == null)
        {
            /* save it on the Mac, it can go onto a tag later */
            job.Step = "Saving it on your Mac";
            string temp = Path.Combine(paths.Temp, hash + ".taf");
            await File.WriteAllBytesAsync(temp, audio.FileContent);
            var saved = shelf.Add(temp, new TonieItem { Title = title, Hash = hash, AudioId = audio.Header.AudioId, Kind = "custom", Seconds = audio.GetStream().TotalSamples / 48000.0, Chapters = titles.Length, Emoji = picture != null ? null : request.Emoji, Color = request.Color, Image = picture != null ? "/api/cover/" + hash : null }, "made");
            File.Delete(temp);
            return new { shelf = saved.Id, hash, title };
        }

        if (existing != null && setup.BackupBeforeReplace)
        {
            job.Step = "Keeping a copy of what was on this tag";
            shelf.Add(existing.Path, existing, "before replacing");
        }

        job.Step = "Putting it on the SD card";
        job.Progress = 0.96;
        await WriteVerifiedAsync(target, audio.FileContent, job.Cancel.Token);
        cards.Forget(target);
        job.Progress = 1;
        return new { card = card.Id, uid, hash, title };
    }

    /* written next to the final name, read back and compared, then renamed: never leaves a half-written tonie */
    private static async Task WriteVerifiedAsync(string target, byte[] content, CancellationToken cancel)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(target)!);
        string temp = Path.Combine(Path.GetDirectoryName(target)!, "." + Path.GetFileName(target) + ".tmp");
        await using (var output = new FileStream(temp, FileMode.Create, FileAccess.Write, FileShare.None, 1 << 16, FileOptions.WriteThrough))
        {
            await output.WriteAsync(content, cancel);
            await output.FlushAsync(cancel);
        }
        byte[] check = await File.ReadAllBytesAsync(temp, cancel);
        if (!check.AsSpan().SequenceEqual(content))
        {
            File.Delete(temp);
            throw new IOException("The SD card did not store the file correctly. Try another card or reader.");
        }
        File.Move(temp, target, true);
    }

    public async Task<object> PutOnTagAsync(Job job, ShelfItem item, string cardId, string rawUid)
    {
        var card = cards.Get(cardId) ?? throw new InvalidOperationException("The SD card is not there anymore.");
        string uid = Uid.Normalize(rawUid) ?? throw new InvalidOperationException("That tag ID does not look right.");
        var existing = cards.Find(card, uid);
        if (existing != null && existing.Hash == item.Hash)
        {
            return new { card = card.Id, uid, same = true };
        }
        if (existing != null && settings.Read(s => s.BackupBeforeReplace))
        {
            job.Step = "Keeping a copy of what was on this tag";
            shelf.Add(existing.Path, existing, "before replacing");
        }
        job.Step = "Putting it on the SD card";
        var (folder, file) = Uid.ContentPath(uid);
        string target = existing?.Path ?? Path.Combine(card.Content, folder, file);
        await WriteVerifiedAsync(target, await File.ReadAllBytesAsync(item.File), job.Cancel.Token);
        cards.Forget(target);
        return new { card = card.Id, uid };
    }

    public object Backup(Job job, List<TonieItem> items)
    {
        var saved = new List<string>();
        for (int index = 0; index < items.Count; index++)
        {
            job.Cancel.Token.ThrowIfCancellationRequested();
            job.Step = $"Saving {items[index].Title}";
            job.Progress = (double)index / items.Count;
            saved.Add(shelf.Add(items[index].Path, items[index], "backup").Id);
        }
        return new { saved };
    }

    public object Remove(Job job, TonieItem item)
    {
        if (settings.Read(s => s.BackupBeforeReplace))
        {
            job.Step = "Keeping a copy first";
            shelf.Add(item.Path, item, "before removing");
        }
        File.Delete(item.Path);
        cards.Forget(item.Path);
        return new { removed = item.Uid };
    }

    /* chapters as separate audio files: "ogg" (the original audio), "m4a" (for the Music app, needs macOS) or "wav" */
    public async Task<object> ExportAsync(Job job, string sourceFile, string title, string artist, List<string> chapterTitles, string format)
    {
        job.Step = "Reading the tonie";
        var audio = await Task.Run(() => TonieAudio.FromFile(sourceFile));
        var stream = audio.GetStream();
        string safeTitle = string.Concat((title ?? "tonie").Split(Path.GetInvalidFileNameChars())).Trim();
        string folder = Path.Combine(paths.Exports, safeTitle);
        Directory.CreateDirectory(folder);
        bool m4a = format == "m4a" && AppInfo.IsMac && File.Exists("/usr/bin/afconvert");

        for (int index = 0; index < stream.Chapters.Count; index++)
        {
            job.Cancel.Token.ThrowIfCancellationRequested();
            string name = chapterTitles != null && index < chapterTitles.Count && !string.IsNullOrWhiteSpace(chapterTitles[index]) ? chapterTitles[index] : "Chapter " + (index + 1);
            job.Step = $"Chapter {index + 1} of {stream.Chapters.Count}: {name}";
            job.Progress = (double)index / stream.Chapters.Count;
            string baseName = Path.Combine(folder, $"{index + 1:00} {string.Concat(name.Split(Path.GetInvalidFileNameChars())).Trim()}");

            if (format == "ogg")
            {
                var tags = new List<string> { "TITLE=" + name, "ALBUM=" + title, "TRACKNUMBER=" + (index + 1) };
                if (!string.IsNullOrEmpty(artist))
                {
                    tags.Add("ARTIST=" + artist);
                }
                await File.WriteAllBytesAsync(baseName + ".ogg", stream.ExtractOgg(index, tags));
                continue;
            }

            string wav = m4a ? Path.Combine(paths.Temp, Guid.NewGuid().ToString("N") + ".wav") : baseName + ".wav";
            await using (var output = File.Create(wav))
            {
                await Task.Run(() => stream.DecodeWav(index, output));
            }
            if (m4a)
            {
                bool ok = AudioTools.Run("/usr/bin/afconvert", new[] { "-f", "m4af", "-d", "aac", "-b", "160000", wav, baseName + ".m4a" }, out string output);
                File.Delete(wav);
                if (!ok)
                {
                    throw new IOException("Could not convert to M4A: " + output);
                }
            }
        }
        return new { folder };
    }

    public object Tidy(Card card)
    {
        int count = 0;
        long bytes = 0;
        foreach (string file in Directory.EnumerateFiles(card.Content, "*", SearchOption.AllDirectories)
            .Concat(Directory.EnumerateFiles(card.Root, "._*")))
        {
            string name = Path.GetFileName(file);
            if (name.StartsWith("._") || name == ".DS_Store" || (name.StartsWith(".") && name.EndsWith(".tmp")))
            {
                bytes += new FileInfo(file).Length;
                File.Delete(file);
                count++;
            }
        }
        return new { count, bytes };
    }
}

public static class AudioTools
{
    public static bool Run(string tool, string[] arguments, out string output)
    {
        var info = new ProcessStartInfo(tool) { RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false };
        foreach (string argument in arguments)
        {
            info.ArgumentList.Add(argument);
        }
        try
        {
            using var process = Process.Start(info)!;
            var error = process.StandardError.ReadToEndAsync();
            output = process.StandardOutput.ReadToEnd();
            process.WaitForExit();
            output += error.Result;
            return process.ExitCode == 0;
        }
        catch (Exception e)
        {
            output = e.Message;
            return false;
        }
    }
}
