using System.Diagnostics;
using System.Text.RegularExpressions;

namespace CrewsTonieBox.Services;

/* reads a tag's UID from a connected reader, so a custom tonie can target the right folder without
   opening a figurine. Uses libnfc (nfc-list) or a Proxmark3 (pm3), or a command set in CTB_NFC_CMD.
   It only reads the UID; it never writes or clones tags. */
public partial class Nfc
{
    [GeneratedRegex(@"[0-9A-Fa-f]{2}(?:[\s:]*[0-9A-Fa-f]{2})+")]
    private static partial Regex HexRun();

    public record Reader(bool Available, string Tool, string Command);

    private readonly Reader reader;

    public Nfc()
    {
        reader = Detect();
    }

    public object Status() => new { available = reader.Available, tool = reader.Tool };

    private static Reader Detect()
    {
        string custom = Environment.GetEnvironmentVariable("CTB_NFC_CMD");
        if (!string.IsNullOrWhiteSpace(custom))
        {
            return new Reader(true, Environment.GetEnvironmentVariable("CTB_NFC_TOOL") ?? "reader", custom);
        }
        /* Tonie tags are ISO 15693 (8-byte UID starting E0 04), which the Proxmark3 reads with
           "hf 15". Many libnfc readers (PN532/ACR122U) do ISO 14443 only and can't read them, so
           the Proxmark3 is tried first. Set CTB_NFC_CMD to override for a different setup. */
        if (Which("pm3") is { } pm3)
        {
            return new Reader(true, "Proxmark3", $"\"{pm3}\" -c \"hf 15 reader\"");
        }
        if (Which("proxmark3") is { } legacy)
        {
            return new Reader(true, "Proxmark3", $"\"{legacy}\" -c \"hf 15 reader\"");
        }
        if (Which("nfc-list") is { } nfc)
        {
            return new Reader(true, "NFC reader (libnfc)", $"\"{nfc}\"");
        }
        return new Reader(false, null, null);
    }

    /* tries for a few seconds so a tag can be held to the reader after the button is pressed */
    public async Task<string> ReadUidAsync(CancellationToken cancel)
    {
        if (!reader.Available)
        {
            return null;
        }
        var deadline = DateTime.UtcNow.AddSeconds(6);
        while (DateTime.UtcNow < deadline && !cancel.IsCancellationRequested)
        {
            string output = await RunAsync(reader.Command, cancel);
            if (Parse(output) is { } uid)
            {
                return uid;
            }
            await Task.Delay(400, cancel);
        }
        return null;
    }

    /* the tag ID out of a reader's text output, as a normalized 8-byte UID, or null.
       Handles "UID: E0 04 ..", "UID = e0 04 ..", "UID(hex): E00403..", and libnfc's
       "UID (NFCID1): ..". The "(NFCID1)" label itself contains hex letters, so parentheticals
       are dropped first. */
    public static string Parse(string output)
    {
        if (string.IsNullOrEmpty(output))
        {
            return null;
        }
        foreach (string raw in output.Split('\n'))
        {
            string line = raw;
            int at = line.IndexOf("NFCID1", StringComparison.OrdinalIgnoreCase);
            if (at < 0)
            {
                at = line.IndexOf("UID", StringComparison.OrdinalIgnoreCase);
            }
            if (at < 0)
            {
                continue;
            }
            string rest = Regex.Replace(line[at..], @"\([^)]*\)", " ");
            var match = HexRun().Match(rest);
            if (!match.Success)
            {
                continue;
            }
            string hex = Regex.Replace(match.Value, "[^0-9A-Fa-f]", "").ToUpperInvariant();
            /* an 8-byte ISO 15693 UID is what a Toniebox tag has; take the first 8 bytes of a longer run */
            if (hex.Length >= 16 && Uid.Normalize(hex[..16]) is { } uid)
            {
                return uid;
            }
        }
        return null;
    }

    private static async Task<string> RunAsync(string command, CancellationToken cancel)
    {
        var info = new ProcessStartInfo("/bin/sh")
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false
        };
        info.ArgumentList.Add("-c");
        info.ArgumentList.Add(command);
        try
        {
            using var process = Process.Start(info)!;
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancel);
            timeout.CancelAfter(TimeSpan.FromSeconds(10));
            string stdout = await process.StandardOutput.ReadToEndAsync(timeout.Token);
            string stderr = await process.StandardError.ReadToEndAsync(timeout.Token);
            await process.WaitForExitAsync(timeout.Token);
            return stdout + "\n" + stderr;
        }
        catch (Exception)
        {
            return "";
        }
    }

    private static string Which(string tool)
    {
        foreach (string dir in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator))
        {
            try
            {
                string path = Path.Combine(dir, tool);
                if (File.Exists(path))
                {
                    return path;
                }
            }
            catch (Exception)
            {
            }
        }
        return null;
    }
}
