using System.Diagnostics;
using System.Text.RegularExpressions;
using System.Web;
using Duboku;
using Microsoft.AspNetCore.Mvc;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddCors();
builder.WebHost.ConfigureKestrel(options => { options.Limits.MaxRequestBodySize = 100_000_000; }); // 100 MB

var app = builder.Build();

app.UseCors(x => x
    .AllowAnyMethod()
    .AllowAnyHeader()
    .SetIsOriginAllowed(origin => true) // allow any origin
);

app.MapGet("test", 
 async (HttpContext context) => {
    context.Response.ContentType = "text/html";
    return await File.ReadAllTextAsync("/Users/leozhou/duboku/server/test.html");
    }
);

app.MapGet("duboku/load/{filename}", async (string filename, HttpContext context) =>
{
    Console.WriteLine($"Load Duboku: {filename}");
    var home = Directory.GetCurrentDirectory();
    var targetPath = Path.Combine(home, $"duboku/{filename}");
    return await DubokuLoadResults.LoadAsync(targetPath);
})
.Produces<DubokuLoadResults>();

app.MapPut("duboku/merge/{filename}/{title}", async (string filename, string title, HttpContext context) =>
{
    // remove any special characters from title, e.g. *, /, \, :, ?, ", <, >, |
    title = Regex.Replace(title, @"[\\/:*?""<>|]", "_");

    Console.WriteLine($"合并 Merge: {filename} as {title}");

    if (!string.IsNullOrWhiteSpace(title)) {
        title = HttpUtility.UrlDecode(title);
    } else {
        title = filename;
    }

    Console.WriteLine($"Merge Duboku: {filename} as {title}");
    var home = Directory.GetCurrentDirectory();
    var targetPath = Path.Combine(home, $"duboku/{filename}");

    if (!Directory.Exists(targetPath)) {
        return 0;
    }


    var filePath = Path.Combine(targetPath, "index.m3u8");
    var target = Path.Combine(home, $"duboku/{title}.mp4");
    if (File.Exists(target)) {
        File.Delete(target);
    }

    var ffmpegPath = Path.DirectorySeparatorChar == '/' ?
        "/usr/local/bin/ffmpeg" :
        "duboku/ffmpeg.exe";

    if (File.Exists(ffmpegPath)) {
        var processStartInfo = new ProcessStartInfo
        {
            FileName = ffmpegPath,
            Arguments = $"-i \"{filePath}\" -c copy \"{target}\"",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };
        
        using (var process = new Process { StartInfo = processStartInfo })
        {
            process.Start();
            string output = await process.StandardError.ReadToEndAsync();
            await process.WaitForExitAsync();

            if (process.ExitCode != 0)
            {
                Console.WriteLine($"FFmpeg error: {output}");
                throw new Exception("FFmpeg process failed.");
            }
        }

        return 0;
    }

    var missing = 0;
    using (var outputStream = File.Create(target))
    {
        var regex = new Regex(@"([^\.]*\.ts)$");
        foreach(var line in await File.ReadAllLinesAsync(filePath)) {
            var match = regex.Match(line);
            if (match.Success) {
                var name = match.Groups[1].Value;
                var inputFile = Path.Combine(targetPath, name);
                if (!File.Exists(inputFile)) {
                    missing++;
                } else {
                    using (var inputStream = File.OpenRead(inputFile))
                    {
                        // Buffer size can be passed as the second argument.
                        inputStream.CopyTo(outputStream);
                    }
                }
            } 
        }
    }

    return missing;
});

app.MapPost("duboku/index/{filename}", async (string filename, HttpContext context) =>
{
    Console.WriteLine($"Duboku index: {filename}");

    var home = Directory.GetCurrentDirectory();
    var targetPath = Path.Combine(home, $"duboku/{filename}");
    if (!Directory.Exists(targetPath)) {
        Directory.CreateDirectory(targetPath);
    }

    var filePath = Path.Combine(targetPath, "index.m3u");
    var finalFile = Path.Combine(targetPath, "index.m3u8");

    using (var sr = new StreamReader(context.Request.Body))
    {
        var temp = await sr.ReadToEndAsync();
        byte[] t = new byte[1024 * 1024]; // 1MB
        if (Convert.TryFromBase64String(temp, t, out int bytesWritten)) {
            if (t.Length < 4 * 1024) {
                Console.WriteLine($"Skipped index {filename}: {t.Length}");
                return Task.CompletedTask;
            }

            await File.WriteAllBytesAsync(filePath, t);
        } else {
            await File.WriteAllTextAsync(filePath, temp);
        }
    }

    var regex = new Regex(@"\/?([\w\d_-]*\.ts)\??");
    var list = new List<string>();
    foreach(var line in await File.ReadAllLinesAsync(filePath)) {
        var match = regex.Match(line);
        if (match.Success) {
            var name = match.Groups[1].Value;
            list.Add(name);
        } else {
            list.Add(line);
        }
    }

    await File.WriteAllLinesAsync(finalFile, list);

    return Task.CompletedTask;
})
.WithName("DubokuIndexFileSave");

app.MapPost("duboku/seg/{filename}/{seg}", async (string filename, string seg, HttpContext context) =>
{
    Console.WriteLine($"Duboku: {filename}, seg: {seg}");

    var home = Directory.GetCurrentDirectory();
    var targetPath = Path.Combine(home, $"duboku/{filename}");
    if (!Directory.Exists(targetPath)) {
        Directory.CreateDirectory(targetPath);
    }

    var filePath = Path.Combine(targetPath, seg);

    var fileInfo = new FileInfo(filePath);
    if (fileInfo.Exists && fileInfo.Length > 512 * 1024) {
        return Task.CompletedTask;
    }

    using (var sr = new StreamReader(context.Request.Body))
    {
        var temp = await sr.ReadToEndAsync();
        var t = Convert.FromBase64String(temp);
        if (t.Length == 0) {
            return Task.CompletedTask;
        }

        await File.WriteAllBytesAsync(filePath, t);
    }

    return Task.CompletedTask;
})
.WithName("DubokuSegFileSave");


app.MapPost("{filename}/{seq}", async (string filename, string seq, HttpContext context) =>
{
    Console.WriteLine($"Filename: {filename}");
    Console.WriteLine($"Seq: {seq}");
    Console.WriteLine(context.Request.Path);

    using (var sr = new StreamReader(context.Request.Body))
    {
        var temp = await sr.ReadToEndAsync();
        var t = Convert.FromBase64String(temp);
        var home = Directory.GetCurrentDirectory();
        var targetPath = Path.Combine(home, $"{filename}.mp4");
        using (var f = new FileStream(targetPath, FileMode.Append))
        {
            await f.WriteAsync(t, 0, t.Length);
            await f.FlushAsync();
        }
    }

    Console.WriteLine(context.Request.Body);

    return Task.CompletedTask;
})
.WithName("StoreFile");


app.Run();
