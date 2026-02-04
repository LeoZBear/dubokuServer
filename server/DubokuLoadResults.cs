using Microsoft.AspNetCore.DataProtection;

namespace Duboku {

    public class DubokuSegment {
        public string Name {get;set;} = "";
        public int StartSec {get;set;} = 0;
        public bool Uploaded {get;set;} = false;
        public string Url {get;set;} = "";
    }

    public class DubokuLoadResults {
        public bool Success {get;set;} = true;
        public string Error {get;set;} = "";
        public List<DubokuSegment> Segments{get;set;} = new();

        public static async Task<DubokuLoadResults> LoadAsync(string folderPath) {
            var res = new DubokuLoadResults();
            if (!Directory.Exists(folderPath)) {
                return res;
            }

            var m3u8File = Path.Combine(folderPath, "index.m3u8");
            if (!File.Exists(m3u8File)) {
                return res;
            }

            var allFiles = Directory.EnumerateFiles(folderPath, "*.ts", SearchOption.TopDirectoryOnly)
                .Where(f => new FileInfo(f).Length > 100)
                .Select(f => Path.GetFileName(f));

            DubokuSegment? seg = null;
            double startSec = 0;
            foreach(var line in await File.ReadAllLinesAsync(m3u8File)) {
                if (line.StartsWith("#EXTINF:")) {
                    seg = new DubokuSegment();
                    var sec = Convert.ToDouble(line.Substring("#EXTINF:".Length, line.Length - 1 - "#EXTINF:".Length));
                    startSec += sec;
                } else if ((line.EndsWith(".ts") || line.Contains(".ts?")) && seg != null) {
                    var filePath = line.Substring(0, line.IndexOf(".ts") + 3);
                    var filePathParts = filePath.Split('/');
                    var tsFile = filePathParts[filePathParts.Length - 1];

                    seg.Name = tsFile;
                    seg.Url = line;
                    seg.StartSec = (int) startSec;

                    if (allFiles.Contains(tsFile)) {
                        seg.Uploaded = true;
                    }

                    res.Segments.Add(seg);
                }
            }

            return res;
        }
    }
}