using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace CrewsTonieBox.Services;

public static class AppInfo
{
    public const string Name = "Crew's Tonie Box";
    public static string Version => typeof(AppInfo).Assembly.GetName().Version?.ToString(3) ?? "1.0.0";
    public static bool IsMac => RuntimeInformation.IsOSPlatform(OSPlatform.OSX);

    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };
}

/* app.log in the data folder: what happened, for troubleshooting */
public static class AppLog
{
    private static readonly object Sync = new();
    private static string file;

    public static void Start(string dataDir)
    {
        file = Path.Combine(dataDir, "app.log");
        try
        {
            if (File.Exists(file) && new FileInfo(file).Length > 1_000_000)
            {
                File.Move(file, file + ".old", true);
            }
        }
        catch (Exception)
        {
        }
    }

    public static void Write(string message)
    {
        if (file == null)
        {
            return;
        }
        lock (Sync)
        {
            try
            {
                File.AppendAllText(file, $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} {message}{Environment.NewLine}");
            }
            catch (Exception)
            {
            }
        }
    }
}

/* where the app keeps its things */
public class AppPaths
{
    public string Data { get; }
    public string Backups { get; }
    public string Exports { get; }
    public string Cache { get; }
    public string Temp { get; }

    public AppPaths(string dataDir = null)
    {
        string home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        Data = dataDir ?? (AppInfo.IsMac
            ? Path.Combine(home, "Library", "Application Support", AppInfo.Name)
            : Path.Combine(Environment.GetEnvironmentVariable("XDG_DATA_HOME") ?? Path.Combine(home, ".local", "share"), "crews-tonie-box"));
        Backups = Path.Combine(Data, "Backups");
        Exports = dataDir != null ? Path.Combine(Data, "Exports") : Path.Combine(home, "Music", AppInfo.Name);
        Cache = Path.Combine(Data, "Cache");
        Temp = Path.Combine(Path.GetTempPath(), "crews-tonie-box-" + Environment.ProcessId);
        foreach (string dir in new[] { Data, Backups, Cache, Temp })
        {
            Directory.CreateDirectory(dir);
        }
    }
}

/* small JSON file that survives restarts */
public class JsonStore<T> where T : class, new()
{
    private readonly string file;
    private readonly object sync = new();
    private T value;

    public JsonStore(string file)
    {
        this.file = file;
        try
        {
            value = File.Exists(file) ? JsonSerializer.Deserialize<T>(File.ReadAllText(file), AppInfo.Json) ?? new T() : new T();
        }
        catch (Exception)
        {
            /* a damaged file must not stop the app, keep a copy for troubleshooting */
            File.Copy(file, file + ".damaged", true);
            value = new T();
        }
    }

    public TResult Read<TResult>(Func<T, TResult> reader)
    {
        lock (sync)
        {
            return reader(value);
        }
    }

    public void Update(Action<T> change)
    {
        lock (sync)
        {
            change(value);
            string temp = file + ".tmp";
            File.WriteAllText(temp, JsonSerializer.Serialize(value, AppInfo.Json));
            File.Move(temp, file, true);
        }
    }
}

public class Settings
{
    public int BitRate { get; set; } = 96;
    public bool Vbr { get; set; } = true;
    public bool BackupBeforeReplace { get; set; } = true;
    public bool AutoUpdateTonies { get; set; } = true;
    public bool Sounds { get; set; } = true;
    public string ChildName { get; set; } = "Crew";
    public DateTime? ToniesUpdated { get; set; }
}

/* tag UIDs: E0:04:03:50:1E:E9:18:F2 lives in CONTENT/F218E91E/500304E0 */
public static partial class Uid
{
    [GeneratedRegex("^[0-9A-F]{16}$")]
    private static partial Regex HexUid();

    public static string Normalize(string uid)
    {
        string hex = Regex.Replace(uid ?? "", "[^0-9A-Fa-f]", "").ToUpperInvariant();
        return HexUid().IsMatch(hex) ? hex : null;
    }

    /* tonie tags are NXP ICODE SLIX: their UIDs start with E0 04 */
    public static bool LooksLikeTonie(string hex) => hex != null && hex.StartsWith("E004");

    public static string Pretty(string hex) => string.Join(":", Enumerable.Range(0, 8).Select(i => hex.Substring(2 * i, 2)));

    public static string Reverse(string hex) => string.Concat(Enumerable.Range(0, hex.Length / 2).Reverse().Select(i => hex.Substring(2 * i, 2)));

    /* relative path inside CONTENT */
    public static (string Folder, string File) ContentPath(string hex)
    {
        string reversed = Reverse(hex);
        return (reversed[..8], reversed[8..]);
    }

    public static string FromContentPath(string folder, string file) => Reverse((folder + file).ToUpperInvariant());
}
