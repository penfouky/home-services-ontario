namespace CrewsTonieBox.Services;

/* what the app knows beyond the tonie files: names and looks of home-made tonies, nicknames for tags */
public class LibraryData
{
    /* by content hash of the tonie file */
    public Dictionary<string, CustomTonie> Tonies { get; set; } = new();
    /* by tag UID */
    public Dictionary<string, string> TagNames { get; set; } = new();
}

public class CustomTonie
{
    public string Title { get; set; }
    public string Emoji { get; set; }
    public string Color { get; set; }
    /* file name of a photo the user picked, in the Covers folder; null means use the emoji */
    public string Picture { get; set; }
    public List<string> Chapters { get; set; } = new();
    public string Uid { get; set; }
    public DateTime Created { get; set; } = DateTime.Now;
}

public class Library
{
    private readonly JsonStore<LibraryData> store;

    public Library(AppPaths paths)
    {
        store = new JsonStore<LibraryData>(Path.Combine(paths.Data, "library.json"));
    }

    public CustomTonie Find(string hash) =>
        hash == null ? null : store.Read(d => d.Tonies.TryGetValue(hash.ToUpperInvariant(), out var tonie) ? tonie : null);

    public void Remember(string hash, CustomTonie tonie) => store.Update(d => d.Tonies[hash.ToUpperInvariant()] = tonie);

    /* changePicture false leaves the photo as it is; true sets it to picture (null clears it, back to the emoji) */
    public void Rename(string hash, string title, string emoji, string color, string picture = null, bool changePicture = false) => store.Update(d =>
    {
        if (!d.Tonies.TryGetValue(hash.ToUpperInvariant(), out var tonie))
        {
            d.Tonies[hash.ToUpperInvariant()] = tonie = new CustomTonie();
        }
        tonie.Title = title ?? tonie.Title;
        tonie.Emoji = emoji ?? tonie.Emoji;
        tonie.Color = color ?? tonie.Color;
        if (changePicture)
        {
            tonie.Picture = picture;
        }
    });

    public void SetChapters(string hash, List<string> chapters) => store.Update(d =>
    {
        if (!d.Tonies.TryGetValue(hash.ToUpperInvariant(), out var tonie))
        {
            d.Tonies[hash.ToUpperInvariant()] = tonie = new CustomTonie();
        }
        tonie.Chapters = chapters ?? new List<string>();
    });

    public string TagName(string uid) => store.Read(d => d.TagNames.TryGetValue(uid, out var name) ? name : null);

    public void NameTag(string uid, string name) => store.Update(d =>
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            d.TagNames.Remove(uid);
        }
        else
        {
            d.TagNames[uid] = name.Trim();
        }
    });
}
