using System.Net;
using System.Security.Cryptography;
using System.Text.Json;
using CrewsTonieBox.Services;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.Extensions.FileProviders;
using Photino.NET;
using TonieFile;

namespace CrewsTonieBox;

public static class Program
{
    /* not async: on macOS the window has to be created on the main thread */
    [STAThread]
    public static void Main(string[] args)
    {
        var options = Options.Parse(args);
        if (options.Version)
        {
            /* a quick self-check for the build and the tests: the executable, libopus and the tonies list load */
            Console.WriteLine($"{AppInfo.Name} {AppInfo.Version} (encoder: {OpusCodec.Name}, tonies: {TonieDb.BuiltInCount()})");
            return;
        }
        var paths = new AppPaths(options.DataDir);
        AppLog.Start(paths.Data);
        AppDomain.CurrentDomain.UnhandledException += (_, e) => AppLog.Write("crashed: " + e.ExceptionObject);

        var settings = new JsonStore<Settings>(Path.Combine(paths.Data, "settings.json"));
        var http = new HttpClient { Timeout = TimeSpan.FromSeconds(60) };
        http.DefaultRequestHeaders.UserAgent.ParseAdd("CrewsTonieBox/" + AppInfo.Version);
        var db = new TonieDb(paths, http);
        var library = new Library(paths);
        var cards = new Cards(db, library, options.SdRoots);
        var staging = new Staging(paths);
        var shelf = new Shelf(paths);
        var jobs = new Jobs();
        var workshop = new Workshop(paths, cards, library, staging, shelf, settings);
        var previews = new Previews();
        var bridge = new WindowBridge();
        var quit = new CancellationTokenSource();
        string token = Convert.ToHexString(RandomNumberGenerator.GetBytes(24));

        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { Args = Array.Empty<string>() });
        builder.Logging.ClearProviders();
        builder.WebHost.UseKestrel(k =>
        {
            k.Listen(IPAddress.Loopback, options.Port);
            k.Limits.MaxRequestBodySize = 4L << 30;
        });
        builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase);
        var app = builder.Build();

        /* only this app's own window may use the API: loopback host, same origin, session cookie */
        int connected = 0;
        app.Use(async (context, next) =>
        {
            var request = context.Request;
            string host = request.Host.Host;
            string origin = request.Headers.Origin;
            if ((host != "127.0.0.1" && host != "localhost") || (!string.IsNullOrEmpty(origin) && origin != $"http://{request.Host}"))
            {
                context.Response.StatusCode = 403;
                return;
            }
            if (request.Path == "/" && request.Query["t"] == token)
            {
                context.Response.Cookies.Append("ctb", token, new CookieOptions { HttpOnly = true, SameSite = SameSiteMode.Strict, Path = "/" });
                context.Response.Redirect("/");
                return;
            }
            if (request.Path.StartsWithSegments("/api") && request.Cookies["ctb"] != token && request.Headers["X-Token"] != token)
            {
                context.Response.StatusCode = 401;
                return;
            }
            context.Response.Headers.CacheControl = "no-store";
            if (request.Path == "/api/state" && Interlocked.Exchange(ref connected, 1) == 0)
            {
                AppLog.Write("page connected: " + request.Headers.UserAgent);
            }
            await next();
        });

        var files = new ManifestEmbeddedFileProvider(typeof(Program).Assembly, "wwwroot");
        app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = files });
        app.UseStaticFiles(new StaticFileOptions { FileProvider = files });

        Api.Map(app, new Api.Context(paths, settings, db, library, cards, staging, shelf, jobs, workshop, previews, bridge, quit));

        app.StartAsync().GetAwaiter().GetResult();
        string url = app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.First();
        Console.WriteLine($"{AppInfo.Name} {AppInfo.Version} at {url} (encoder: {OpusCodec.Name}, tonies: {db.Count}, {db.Source})");
        AppLog.Write($"started {AppInfo.Version} on {System.Runtime.InteropServices.RuntimeInformation.OSDescription} ({System.Runtime.InteropServices.RuntimeInformation.OSArchitecture}), encoder {OpusCodec.Name}, {db.Count} tonies ({db.Source})");
        if (options.NoWindow)
        {
            Console.WriteLine($"Open {url}/?t={token}");
        }

        if (settings.Read(s => s.AutoUpdateTonies) && (settings.Read(s => s.ToniesUpdated) ?? DateTime.MinValue) < DateTime.Now.AddDays(-7) && !options.NoWindow)
        {
            _ = Task.Run(async () =>
            {
                try
                {
                    await db.UpdateAsync();
                    settings.Update(s => s.ToniesUpdated = DateTime.Now);
                }
                catch (Exception)
                {
                    /* offline: the built-in list works too */
                }
            });
        }

        Console.CancelKeyPress += (_, e) =>
        {
            e.Cancel = true;
            quit.Cancel();
        };
        /* SIGTERM, e.g. when the Mac logs out: the host stops, the window has to go too */
        app.Lifetime.ApplicationStopping.Register(() => quit.Cancel());

        bool windowShown = false;
        if (!options.NoWindow && !options.OpenBrowser)
        {
            try
            {
                var window = new PhotinoWindow()
                    .SetTitle(AppInfo.Name)
                    .SetUseOsDefaultSize(false)
                    .SetSize(1240, 840)
                    .SetMinSize(960, 640)
                    .SetResizable(true)
                    .SetDevToolsEnabled(options.Dev)
                    .SetContextMenuEnabled(options.Dev)
                    .SetGrantBrowserPermissions(true)
                    .SetMediaAutoplayEnabled(true)
                    .Center()
                    .RegisterWindowCreatedHandler((_, _) => AppLog.Write("window opened"))
                    .Load(new Uri($"{url}/?t={token}"));
                /* next to the executable, or in Contents/Resources of the Mac app bundle */
                string icon = new[] { "icon.png", "../Resources/icon.png" }.Select(f => Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, f))).FirstOrDefault(File.Exists);
                if (icon != null)
                {
                    window.SetIconFile(icon);
                }
                bridge.Window = window;
                quit.Token.Register(() => window.Close());
                windowShown = true;
                window.WaitForClose();
            }
            catch (Exception e)
            {
                AppLog.Write("the window did not open, using the web browser: " + e);
                bridge.Window = null;
                windowShown = false;
            }
        }

        if (!windowShown)
        {
            if (!options.NoWindow)
            {
                Desktop.Open($"{url}/?t={token}");
            }
            quit.Token.WaitHandle.WaitOne();
        }

        app.StopAsync().GetAwaiter().GetResult();
        try
        {
            Directory.Delete(paths.Temp, true);
        }
        catch (Exception)
        {
        }
    }
}
