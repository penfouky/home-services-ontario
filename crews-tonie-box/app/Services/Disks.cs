using System.Diagnostics;
using System.Xml.Linq;

namespace CrewsTonieBox.Services;

/* setting up a plain microSD card for the Toniebox: create the CONTENT folder on a card that is
   already FAT/exFAT, or (macOS only) erase and format a blank card to FAT32. Formatting wipes the
   card, so it is gated behind a typed confirmation. */
public class Disks
{
    public record Disk(string Id, string Name, long Size, string Mount, bool HasContent, bool LooksLikeCard);

    private readonly Cards cards;
    private readonly string diskutil;
    private readonly bool forced;

    public Disks(Cards cards)
    {
        this.cards = cards;
        diskutil = Environment.GetEnvironmentVariable("CTB_DISKUTIL") ?? "diskutil";
        forced = Environment.GetEnvironmentVariable("CTB_FORCE_DISKS") == "1";
    }

    /* erase/format is a macOS thing (diskutil); the test seam turns it on elsewhere */
    public bool CanFormat => AppInfo.IsMac || forced;

    public List<Disk> List()
    {
        if (!CanFormat)
        {
            return new List<Disk>();
        }
        var disks = new List<Disk>();
        try
        {
            string xml = Run(diskutil, new[] { "list", "-plist", "external", "physical" }, out _);
            var plist = Plist.Parse(xml);
            if (plist is Dictionary<string, object> root && root.TryGetValue("AllDisksAndPartitions", out var all) && all is List<object> entries)
            {
                foreach (var entry in entries.OfType<Dictionary<string, object>>())
                {
                    string id = "/dev/" + Str(entry, "DeviceIdentifier");
                    long size = Long(entry, "Size");
                    string name = null, mount = null;
                    bool hasContent = false;
                    var parts = entry.TryGetValue("Partitions", out var p) && p is List<object> list ? list.OfType<Dictionary<string, object>>() : Enumerable.Empty<Dictionary<string, object>>();
                    foreach (var part in parts)
                    {
                        string volume = Str(part, "VolumeName");
                        string partMount = Str(part, "MountPoint");
                        if (!string.IsNullOrEmpty(volume) && name == null)
                        {
                            name = volume;
                        }
                        if (!string.IsNullOrEmpty(partMount))
                        {
                            mount = partMount;
                            if (Cards.ContentFolder(partMount) != null)
                            {
                                hasContent = true;
                            }
                        }
                    }
                    disks.Add(new Disk(id, string.IsNullOrEmpty(name) ? Str(entry, "DeviceIdentifier") : name, size, mount, hasContent, size is > 0 and < 130L * 1000 * 1000 * 1000));
                }
            }
        }
        catch (Exception)
        {
            /* no external disks, or diskutil not available */
        }
        return disks;
    }

    /* makes a card the Toniebox can use without erasing it: just add the CONTENT folder */
    public (bool Ok, string Message, string CardId) Prepare(string folder)
    {
        if (string.IsNullOrWhiteSpace(folder) || !Directory.Exists(folder))
        {
            return (false, "That folder is not there.", null);
        }
        string content = Cards.ContentFolder(folder) ?? Path.Combine(folder, "CONTENT");
        try
        {
            Directory.CreateDirectory(content);
            /* a quick writability check, so a locked card fails clearly */
            string probe = Path.Combine(content, ".ctb-write-test");
            File.WriteAllText(probe, "ok");
            File.Delete(probe);
        }
        catch (UnauthorizedAccessException)
        {
            return (false, "The card is locked or read-only. Check the little lock switch on the SD card.", null);
        }
        catch (Exception e)
        {
            return (false, e.Message, null);
        }
        cards.AddFolder(folder);
        return (true, "This card is ready for tonies.", Cards.CardId(folder));
    }

    public async Task<object> FormatAsync(Job job, string diskId, string label, string confirm)
    {
        if (!CanFormat)
        {
            throw new InvalidOperationException("Formatting a card is only available on a Mac.");
        }
        if (string.IsNullOrWhiteSpace(diskId) || confirm != diskId)
        {
            throw new InvalidOperationException("Please confirm which card to erase.");
        }
        /* a FAT32 volume label: A–Z, 0–9, up to 11 characters */
        string safe = new string((label ?? "TONIES").ToUpperInvariant().Where(char.IsLetterOrDigit).ToArray());
        safe = safe.Length == 0 ? "TONIES" : safe[..Math.Min(11, safe.Length)];

        job.Step = "Erasing and formatting the card";
        string output = await Task.Run(() =>
        {
            Run(diskutil, new[] { "eraseDisk", "FAT32", safe, "MBRFormat", diskId }, out int code);
            return code == 0 ? null : "diskutil could not format the card.";
        }, job.Cancel.Token);
        if (output != null)
        {
            throw new IOException(output);
        }

        job.Step = "Getting it ready for tonies";
        string volumes = Environment.GetEnvironmentVariable("CTB_VOLUMES") ?? "/Volumes";
        string mount = Path.Combine(volumes, safe);
        for (int i = 0; i < 20 && !Directory.Exists(mount); i++)
        {
            await Task.Delay(250, job.Cancel.Token);
        }
        var (ok, message, cardId) = Prepare(mount);
        return new { ok, message, cardId, mount };
    }

    private static string Run(string tool, string[] arguments, out int exitCode)
    {
        var parts = tool.Split(' ', 2);
        var info = new ProcessStartInfo(parts[0]) { RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false };
        if (parts.Length > 1)
        {
            info.ArgumentList.Add(parts[1]);
        }
        foreach (string argument in arguments)
        {
            info.ArgumentList.Add(argument);
        }
        using var process = Process.Start(info)!;
        string stdout = process.StandardOutput.ReadToEnd();
        string stderr = process.StandardError.ReadToEnd();
        process.WaitForExit();
        exitCode = process.ExitCode;
        return stdout + stderr;
    }

    private static string Str(Dictionary<string, object> d, string key) => d.TryGetValue(key, out var v) && v is string s ? s : null;
    private static long Long(Dictionary<string, object> d, string key) => d.TryGetValue(key, out var v) && v is long n ? n : 0;
}

/* just enough of an Apple XML plist reader for diskutil's output */
public static class Plist
{
    public static object Parse(string xml)
    {
        var doc = XDocument.Parse(xml);
        var root = doc.Root?.Elements().FirstOrDefault();
        return root == null ? null : Node(root);
    }

    private static object Node(XElement element)
    {
        switch (element.Name.LocalName)
        {
            case "dict":
                var dict = new Dictionary<string, object>();
                var children = element.Elements().ToList();
                for (int i = 0; i + 1 < children.Count; i += 2)
                {
                    if (children[i].Name.LocalName == "key")
                    {
                        dict[children[i].Value] = Node(children[i + 1]);
                    }
                }
                return dict;
            case "array":
                return element.Elements().Select(Node).ToList();
            case "integer":
                return long.TryParse(element.Value, out long n) ? n : 0L;
            case "true":
                return true;
            case "false":
                return false;
            default:
                return element.Value;
        }
    }
}
