using System.Security.Cryptography;
using System.Text;
using CrewsTonieBox.Services;
using Microsoft.AspNetCore.StaticFiles;
using TonieFile;

namespace CrewsTonieBox;

public static class Api
{
    public record Context(AppPaths Paths, JsonStore<Settings> Settings, TonieDb Db, Library Library, Cards Cards, Staging Staging,
        Shelf Shelf, Covers Covers, Import Import, Jobs Jobs, Workshop Workshop, Previews Previews, WindowBridge Bridge, CancellationTokenSource Quit);

    public record RenameBody(string Title, string Emoji, string Color, string Picture);
    public record NameBody(string Name);
    public record FormatBody(string Format);
    public record TargetBody(string CardId, string Uid);
    public record PathBody(string Path);
    public record ImportBody(string Url, string Title);

    private static readonly FileExtensionContentTypeProvider ContentTypes = new();

    public static void Map(WebApplication app, Context c)
    {
        var api = app.MapGroup("/api");

        api.MapGet("/state", () => new
        {
            app = new
            {
                name = AppInfo.Name,
                version = AppInfo.Version,
                encoder = OpusCodec.Name,
                platform = AppInfo.IsMac ? "mac" : OperatingSystem.IsLinux() ? "linux" : "other",
                dialogs = c.Bridge.HasDialogs,
                eject = AppInfo.IsMac,
                m4a = AppInfo.IsMac && File.Exists("/usr/bin/afconvert"),
                convert = AudioInput.CanConvert(),
                import = c.Import.Enabled,
                formats = AudioInput.Extensions,
                shelf = c.Shelf.Folder,
                exports = c.Paths.Exports
            },
            db = new { count = c.Db.Count, source = c.Db.Source },
            settings = c.Settings.Read(s => s),
            cards = c.Cards.Find().Select(card => new { card.Id, card.Name, card.Root, card.TotalBytes, card.FreeBytes, card.Removable, card.Manual, signature = Signature(card) }),
            shelf = c.Shelf.List().Count,
            busy = c.Jobs.Busy()
        });

        /* ---- tonies on a card ---- */

        api.MapGet("/cards/{id}/tonies", (string id) =>
            c.Cards.Get(id) is { } card ? Results.Ok(c.Cards.List(card)) : NoCard());

        api.MapGet("/cards/{id}/tonies/{uid}", async (string id, string uid) =>
        {
            if (Find(c, id, uid) is not { } item)
            {
                return NoTonie();
            }
            List<double> seconds = null;
            /* an unfinished download still has the chapters it got so far */
            if (item.Problem == null || item.Problem == "incomplete")
            {
                try
                {
                    seconds = await Task.Run(() => c.Previews.ChapterSeconds(item.Path, item.Hash));
                }
                catch (Exception)
                {
                }
            }
            return Results.Ok(new { tonie = item, chapterSeconds = seconds });
        });

        api.MapMethods("/cards/{id}/tonies/{uid}/chapters/{n:int}.wav", new[] { "GET", "HEAD" }, async (HttpContext http, string id, string uid, int n) =>
        {
            if (Find(c, id, uid) is { } item)
            {
                await c.Previews.WavAsync(http, item.Path, n);
            }
            else
            {
                http.Response.StatusCode = 404;
            }
        });

        api.MapGet("/cards/{id}/tonies/{uid}/chapters/{n:int}.ogg", (string id, string uid, int n) =>
            Find(c, id, uid) is { } item ? c.Previews.Ogg(item.Path, n, item.Title) : NoTonie());

        api.MapPost("/cards/{id}/tonies/{uid}/backup", (string id, string uid) =>
            Find(c, id, uid) is { } item ? Results.Ok(c.Jobs.Start("backup", "Saving " + item.Title, job => Task.FromResult(c.Workshop.Backup(job, new List<TonieItem> { item })))) : NoTonie());

        api.MapPost("/cards/{id}/tonies/{uid}/remove", (string id, string uid) =>
            Find(c, id, uid) is { } item ? Results.Ok(c.Jobs.Start("remove", "Removing " + item.Title, job => Task.FromResult(c.Workshop.Remove(job, item)))) : NoTonie());

        api.MapPost("/cards/{id}/tonies/{uid}/export", (string id, string uid, FormatBody body) =>
            Find(c, id, uid) is { } item
                ? Results.Ok(c.Jobs.Start("export", "Saving songs of " + item.Title, job => c.Workshop.ExportAsync(job, item.Path, item.Title, item.Series, item.ChapterTitles, body.Format ?? "ogg")))
                : NoTonie());

        api.MapPost("/cards/{id}/tonies/{uid}/rename", (string id, string uid, RenameBody body) =>
        {
            if (Find(c, id, uid) is not { } item || item.Hash == null)
            {
                return NoTonie();
            }
            bool changePicture;
            string cover = null;
            if (body.Picture is null or "keep")
            {
                changePicture = false;
            }
            else if (body.Picture.Length == 0)
            {
                changePicture = true;
                c.Covers.Clear(item.Hash);
            }
            else
            {
                cover = c.Covers.Keep(body.Picture, item.Hash);
                changePicture = cover != null;
            }
            c.Library.Rename(item.Hash, body.Title?.Trim(), body.Emoji, body.Color, cover, changePicture);
            return Results.Ok(Find(c, id, uid));
        });

        /* a chapter of an existing tonie, staged as a source for a new one */
        api.MapPost("/cards/{id}/tonies/{uid}/chapters/{n:int}/stage", async (string id, string uid, int n) =>
        {
            if (Find(c, id, uid) is not { } item)
            {
                return NoTonie();
            }
            var staged = await Task.Run(() => StageChapter(c, item.Path, n, item.Title, ChapterName(item.ChapterTitles, n)));
            return staged != null ? Results.Ok(staged) : NoTonie();
        });

        api.MapPost("/cards/{id}/tags/{uid}/name", (string id, string uid, NameBody body) =>
        {
            string hex = Uid.Normalize(uid);
            if (hex == null)
            {
                return Results.BadRequest(new { error = "That tag ID does not look right." });
            }
            c.Library.NameTag(hex, body.Name);
            return Results.Ok();
        });

        api.MapPost("/cards/{id}/backup-all", (string id) =>
        {
            if (c.Cards.Get(id) is not { } card)
            {
                return NoCard();
            }
            var items = c.Cards.List(card).Where(i => i.Problem == null).ToList();
            return Results.Ok(c.Jobs.Start("backup", $"Saving {items.Count} tonies", job => Task.FromResult(c.Workshop.Backup(job, items))));
        });

        api.MapPost("/cards/{id}/tidy", (string id) =>
            c.Cards.Get(id) is { } card ? Results.Ok(c.Workshop.Tidy(card)) : NoCard());

        api.MapPost("/cards/{id}/eject", (string id) =>
        {
            if (c.Cards.Get(id) is not { } card)
            {
                return NoCard();
            }
            if (c.Jobs.Busy())
            {
                return Results.Ok(new { ok = false, message = "Wait until the magic is done, then eject." });
            }
            var (ok, message) = Desktop.Eject(card);
            return Results.Ok(new { ok, message });
        });

        api.MapPost("/cards/{id}/reveal", (string id) =>
            c.Cards.Get(id) is { } card ? Results.Ok(Desktop.Reveal(card.Content)) : NoCard());

        api.MapPost("/cards/add-folder", async (PathBody body) =>
        {
            string folder = body?.Path ?? await c.Bridge.PickFolderAsync("Choose the SD card or its CONTENT folder");
            if (folder == null)
            {
                return Results.Ok(new { added = false });
            }
            if (Cards.ContentFolder(folder) == null)
            {
                return Results.BadRequest(new { error = "There is no CONTENT folder in there. A Toniebox SD card has one at the top." });
            }
            c.Cards.AddFolder(folder);
            return Results.Ok(new { added = true, id = Cards.CardId(folder) });
        });

        api.MapPost("/cards/{id}/forget", (string id) =>
        {
            if (c.Cards.Get(id) is { Manual: true } card)
            {
                c.Cards.RemoveFolder(card.Root);
            }
            return Results.Ok();
        });

        /* ---- tonies saved on the Mac ---- */

        api.MapGet("/shelf", () => c.Shelf.List());

        api.MapGet("/shelf/{sid}", async (string sid) =>
        {
            if (c.Shelf.Get(sid) is not { } item)
            {
                return NoTonie();
            }
            var seconds = await Task.Run(() => c.Previews.ChapterSeconds(item.File, item.Hash));
            var custom = c.Library.Find(item.Hash);
            return Results.Ok(new { item, chapterSeconds = seconds, chapterTitles = custom?.Chapters });
        });

        api.MapMethods("/shelf/{sid}/chapters/{n:int}.wav", new[] { "GET", "HEAD" }, async (HttpContext http, string sid, int n) =>
        {
            if (c.Shelf.Get(sid) is { } item)
            {
                await c.Previews.WavAsync(http, item.File, n);
            }
            else
            {
                http.Response.StatusCode = 404;
            }
        });

        api.MapGet("/shelf/{sid}/chapters/{n:int}.ogg", (string sid, int n) =>
            c.Shelf.Get(sid) is { } item ? c.Previews.Ogg(item.File, n, item.Title) : NoTonie());

        api.MapPost("/shelf/{sid}/chapters/{n:int}/stage", async (string sid, int n) =>
        {
            if (c.Shelf.Get(sid) is not { } item)
            {
                return NoTonie();
            }
            var chapters = c.Library.Find(item.Hash)?.Chapters;
            var staged = await Task.Run(() => StageChapter(c, item.File, n, item.Title, ChapterName(chapters, n)));
            return staged != null ? Results.Ok(staged) : NoTonie();
        });

        api.MapPost("/shelf/{sid}/put", (string sid, TargetBody body) =>
            c.Shelf.Get(sid) is { } item ? Results.Ok(c.Jobs.Start("put", "Putting " + item.Title + " on a tonie", job => c.Workshop.PutOnTagAsync(job, item, body.CardId, body.Uid))) : NoTonie());

        api.MapPost("/shelf/{sid}/export", (string sid, FormatBody body) =>
        {
            if (c.Shelf.Get(sid) is not { } item)
            {
                return NoTonie();
            }
            var titles = c.Library.Find(item.Hash)?.Chapters;
            return Results.Ok(c.Jobs.Start("export", "Saving songs of " + item.Title, job => c.Workshop.ExportAsync(job, item.File, item.Title, null, titles, body.Format ?? "ogg")));
        });

        api.MapDelete("/shelf/{sid}", (string sid) =>
        {
            if (c.Shelf.Get(sid) is { } item)
            {
                c.Shelf.Delete(item);
            }
            return Results.Ok();
        });

        /* ---- audio files for a new tonie ---- */

        api.MapPost("/files/pick", async () =>
        {
            if (!c.Bridge.HasDialogs)
            {
                return Results.BadRequest(new { error = "no dialogs" });
            }
            var picked = await c.Bridge.PickFilesAsync() ?? Array.Empty<string>();
            return Results.Ok(await Task.Run(() => TonieAudio.SortTracks(picked.Where(AudioInput.IsSupported)).Select(c.Staging.Add).ToList()));
        });

        api.MapPost("/files/pick-folder", async () =>
        {
            if (!c.Bridge.HasDialogs)
            {
                return Results.BadRequest(new { error = "no dialogs" });
            }
            string folder = await c.Bridge.PickFolderAsync("Choose a folder with stories or songs");
            if (folder == null)
            {
                return Results.Ok(new List<StagedFile>());
            }
            return Results.Ok(await Task.Run(() => TonieAudio.SortTracks(Directory.GetFiles(folder).Where(AudioInput.IsSupported)).Select(c.Staging.Add).ToList()));
        });

        api.MapPut("/files/upload", async (HttpRequest request, string name) =>
        {
            if (!AudioInput.IsSupported(name ?? ""))
            {
                return Results.BadRequest(new { error = $"'{name}' is not a sound file this app can use." });
            }
            return Results.Ok(await c.Staging.UploadAsync(name, request.Body, request.HttpContext.RequestAborted));
        });

        api.MapGet("/files/{fid}/audio", (string fid) =>
        {
            if (c.Staging.Get(fid) is not { } file)
            {
                return Results.NotFound();
            }
            if (!ContentTypes.TryGetContentType(file.Name, out string type))
            {
                type = "application/octet-stream";
            }
            return Results.File(file.Path, type, enableRangeProcessing: true);
        });

        /* ---- free, public-domain audio (LibriVox) ---- */

        api.MapGet("/import/search", async (string q, CancellationToken cancel) =>
            Results.Ok(await c.Import.SearchAsync(q, cancel)));

        api.MapGet("/import/{projectId}/tracks", async (string projectId, CancellationToken cancel) =>
        {
            try
            {
                return Results.Ok(await c.Import.TracksAsync(projectId, cancel));
            }
            catch (Exception)
            {
                return Results.Ok(new List<Import.ImportTrack>());
            }
        });

        api.MapPost("/import/track", async (ImportBody body, CancellationToken cancel) =>
        {
            try
            {
                return Results.Ok(await c.Import.StageTrackAsync(body.Url, body.Title, cancel));
            }
            catch (InvalidOperationException e)
            {
                return Results.BadRequest(new { error = e.Message });
            }
            catch (Exception)
            {
                return Results.BadRequest(new { error = "That chapter could not be downloaded. Check your internet and try again." });
            }
        });

        /* ---- pictures for your own tonies ---- */

        api.MapPut("/covers/upload", async (HttpRequest request, string name) =>
        {
            try
            {
                return Results.Ok(await c.Covers.UploadAsync(name, request.Body, request.HttpContext.RequestAborted));
            }
            catch (InvalidOperationException e)
            {
                return Results.BadRequest(new { error = e.Message });
            }
        });

        api.MapGet("/cover/{hash}", (string hash) =>
        {
            string file = c.Covers.Find(hash);
            if (file == null)
            {
                return Results.NotFound();
            }
            ContentTypes.TryGetContentType(file, out string type);
            return Results.File(file, type ?? "image/png");
        });

        /* ---- making tonies ---- */

        api.MapPost("/make", (MakeRequest request) =>
            Results.Ok(c.Jobs.Start("make", "Making " + (request.Title ?? "a tonie"), job => c.Workshop.MakeAsync(job, request))));

        api.MapGet("/jobs/{jid}", (string jid) => c.Jobs.Get(jid) is { } job ? Results.Ok(job) : Results.NotFound());

        api.MapPost("/jobs/{jid}/cancel", (string jid) =>
        {
            c.Jobs.Get(jid)?.Cancel.Cancel();
            return Results.Ok();
        });

        api.MapGet("/uid/{uid}", (string uid) =>
        {
            string hex = Uid.Normalize(uid);
            if (hex == null)
            {
                return Results.Ok(new { valid = false });
            }
            var (folder, file) = Uid.ContentPath(hex);
            return Results.Ok(new { valid = true, uid = hex, pretty = Uid.Pretty(hex), tonieLike = Uid.LooksLikeTonie(hex), folder, file });
        });

        /* ---- odds and ends ---- */

        api.MapGet("/image", async (string url) =>
        {
            try
            {
                string file = await c.Db.ImageFileAsync(url);
                if (file == null)
                {
                    return Results.NotFound();
                }
                ContentTypes.TryGetContentType(file, out string type);
                return Results.File(file, type ?? "image/jpeg");
            }
            catch (Exception)
            {
                return Results.NotFound();
            }
        });

        api.MapPost("/db/update", () => Results.Ok(c.Jobs.Start("update", "Updating the tonie list", async job =>
        {
            job.Step = "Downloading the newest tonie list";
            string source = await c.Db.UpdateAsync(job.Cancel.Token);
            c.Settings.Update(s => s.ToniesUpdated = DateTime.Now);
            return new { count = c.Db.Count, source };
        })));

        api.MapPost("/settings", (Settings body) =>
        {
            c.Settings.Update(s =>
            {
                s.BitRate = Math.Clamp(body.BitRate, 32, 192);
                s.Vbr = body.Vbr;
                s.BackupBeforeReplace = body.BackupBeforeReplace;
                s.AutoUpdateTonies = body.AutoUpdateTonies;
                s.Sounds = body.Sounds;
                s.ChildName = string.IsNullOrWhiteSpace(body.ChildName) ? "Crew" : body.ChildName.Trim();
            });
            return c.Settings.Read(s => s);
        });

        api.MapPost("/reveal", (PathBody body) =>
        {
            string path = Path.GetFullPath(body.Path ?? "");
            bool allowed = path.StartsWith(c.Paths.Exports) || path.StartsWith(c.Shelf.Folder) || c.Cards.Find().Any(card => path.StartsWith(card.Root));
            return allowed && (File.Exists(path) || Directory.Exists(path)) ? Results.Ok(Desktop.Reveal(path)) : Results.NotFound();
        });

        api.MapPost("/quit", () =>
        {
            c.Quit.Cancel();
            return Results.Ok();
        });
    }

    /* pulls one chapter out of a tonie file and stages it as a source for a new tonie */
    private static StagedFile StageChapter(Context c, string tonieFile, int n, string tonieTitle, string chapterName)
    {
        var stream = c.Previews.Stream(tonieFile);
        if (n < 0 || n >= stream.Chapters.Count)
        {
            return null;
        }
        byte[] ogg = stream.ExtractOgg(n, new[] { "TITLE=" + chapterName });
        return c.Staging.AddOgg(ogg, chapterName, $"{tonieTitle} – {chapterName}", stream.Chapters[n].Seconds);
    }

    private static string ChapterName(List<string> titles, int n) =>
        titles != null && n >= 0 && n < titles.Count && !string.IsNullOrWhiteSpace(titles[n]) ? titles[n] : "Chapter " + (n + 1);

    private static TonieItem Find(Context c, string cardId, string uid)
    {
        string hex = Uid.Normalize(uid);
        return hex != null && c.Cards.Get(cardId) is { } card ? c.Cards.Find(card, hex) : null;
    }

    /* changes when tonies are added, replaced or removed (writes go through a rename, which touches the folder) */
    private static string Signature(Card card)
    {
        var text = new StringBuilder();
        try
        {
            text.Append(Directory.GetLastWriteTimeUtc(card.Content).Ticks);
            foreach (string folder in Directory.EnumerateDirectories(card.Content))
            {
                text.Append(Path.GetFileName(folder)).Append(Directory.GetLastWriteTimeUtc(folder).Ticks);
            }
        }
        catch (Exception)
        {
        }
        return Convert.ToHexString(SHA1.HashData(Encoding.UTF8.GetBytes(text.ToString())))[..12];
    }

    private static IResult NoCard() => Results.NotFound(new { error = "The SD card is not there anymore." });

    private static IResult NoTonie() => Results.NotFound(new { error = "That tonie is not there anymore." });
}
