const cliProgress = require("cli-progress");
const { exec, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
let title = "";

// Create a multi-bar container
const multibar = new cliProgress.MultiBar(
  {
    clearOnComplete: false,
    hideCursor: true,
    format: "{bar} | {percentage}% | {value}/{total} | {title} | ETA: {eta}s",
  },
  cliProgress.Presets.shades_classic
);

function parseBookInfo(title) {
  const titleRegex = /^(.*)- Writ/;
  const authorRegex = /ten by (.*) -/;
  const narratorRegex = / Narrated by (.*)$/;

  const match = title.match(
    new RegExp(
      `${titleRegex.source}${authorRegex.source}${narratorRegex.source}`
    )
  );

  if (!match) {
    throw new Error(`Could not parse book information from title: '${title}'`);
  }

  const titleExtracted = match[1].trim();
  const author = match[2] || null;
  const narrator = match[3] || null;

  return { title: titleExtracted, author, narrator };
}

async function execCommand(command) {
  return new Promise((resolve, reject) => {
    const childProcess = spawn(command, {
      stdio: "inherit",
      shell: true,
    });
    childProcess.on("error", (error) => {
      reject(error);
    });
    childProcess.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command exited with code ${code}.`));
      }
    });
  });
}

function updateTitleWithAlbum(filepath) {
  const content = fs.readFileSync(filepath, "utf-8");
  const lines = content.split("\n");

  let titleLineIndex = null;
  let albumLineIndex = null;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("title=")) {
      titleLineIndex = i;
    } else if (lines[i].startsWith("album=")) {
      albumLineIndex = i;
    }
  }

  if (titleLineIndex === null || albumLineIndex === null) {
    console.log(
      `File '${filepath}' does not contain both required lines ('title=' and 'album=') using folder name instead`
    );
    const folderMeta = parseBookInfo(title);
    lines.push(`title=${folderMeta.title}`);
    lines.push(`album=${folderMeta.title}`);
    lines.push(`author=${folderMeta.author}`);
    lines.push(
      `artist=${folderMeta.author}; Narrated by ${folderMeta.narrator}`
    );
    lines.push(`album_artist=${folderMeta.author}`);
  } else {
    const albumValue = lines[albumLineIndex].slice("album=".length);
    lines[titleLineIndex] = `title=${albumValue}`;
  }

  fs.writeFileSync(filepath, lines.join("\n"));
}

async function getDuration(filepath) {
  // Optimize ffprobe command with faster seeking and reduced output
  const command = `ffprobe -v error -select_streams a:0 -show_entries format=duration -of csv=p=0 "${filepath.replace(
    /\\/g,
    "/"
  )}"`;

  const { stdout } = await new Promise((resolve, reject) => {
    exec(command, { cwd: process.cwd() }, (error, stdout, stderr) => {
      if (error) reject(error);
      resolve({ stdout, stderr });
    });
  });

  return parseInt(stdout.trim().replace(".", ""));
}

async function getChapterTitle(filepath) {
  return new Promise((resolve, reject) => {
    const command = `ffprobe -show_entries format_tags="title" -v quiet "${filepath.replace(
      /\\/g,
      "/"
    )}"`;
    exec(command, { cwd: process.cwd() }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }

      const lines = stdout.split("\n");
      const titleRegex = /^TAG:title=(.*)$/;

      for (const line of lines) {
        const match = line.match(titleRegex);
        if (match) {
          resolve(match[1]);
          return;
        }
      }

      const start = "- ";
      const title = filepath.slice(
        filepath.lastIndexOf(start) + start.length,
        filepath.indexOf(".m4a")
      );
      resolve(title);
    });
  });
}

async function makeChaptersMetadata(folder, listAudioFiles, outputDir, metadatafile) {
  const progressBar = multibar.create(listAudioFiles.length, 0, {
    title: "Processing Chapters",
  });
  const chapters = {};

  // Process chapters in chunks to avoid memory overload
  const CHUNK_SIZE = 5;
  for (let i = 0; i < listAudioFiles.length; i += CHUNK_SIZE) {
    const chunk = listAudioFiles.slice(i, i + CHUNK_SIZE);
    await Promise.all(
      chunk.map(async (audioFile, index) => {
        const count = i + index + 1;
        const filePath = path.join(folder, audioFile);
        const duration = await getDuration(filePath);

        // Extract the chapter number from filename for proper sorting
        const chapterNum = audioFile.match(/(\d{4})/)?.[1] || 
                          count.toString().padStart(4, "0");

        chapters[chapterNum] = {
          duration,
          title: path.basename(audioFile, ".m4a"),
          originalIndex: count - 1 // Keep track of original order
        };

        progressBar.increment();
      })
    );
  }

  // Calculate start/end times with proper sorting
  let currentTime = 0;
  Object.keys(chapters)
    .sort((a, b) => {
      // First try to sort by chapter number
      const numA = parseInt(a);
      const numB = parseInt(b);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      
      // Fall back to original index if chapter numbers are invalid
      return chapters[a].originalIndex - chapters[b].originalIndex;
    })
    .forEach(chapter => {
      chapters[chapter].start = currentTime;
      chapters[chapter].end = currentTime + chapters[chapter].duration;
      currentTime = chapters[chapter].end + 1;
    });

  // Write metadata
  const firstFile = path.join(folder, listAudioFiles[0]);
  await execCommand(
    `ffmpeg -y -loglevel error -i "${firstFile}" -f ffmetadata "${metadatafile}"`
  );

  updateTitleWithAlbum(metadatafile);

  const chapterMetadata = Object.entries(chapters)
    .sort((a, b) => a[1].start - b[1].start)
    .map(([_, data]) =>
      `[CHAPTER]\nTIMEBASE=1/1000000\nSTART=${data.start}\nEND=${data.end}\ntitle=${data.title}`
    )
    .join("\n\n");

  fs.appendFileSync(metadatafile, chapterMetadata);
}

async function concatenateAllToOneWithChapters(
  outputDir,
  metadatafile,
  listfile,
  folder,
  listAudioFiles
) {
  const progressBar = multibar.create(100, 0, { title: "Concatenating Files" });
  const filename = path.join(outputDir, `${title}.m4a`);

  // Calculate total duration by summing up all file durations
  let totalDuration = 0;
  for (const file of listAudioFiles) {
    const duration = await getDuration(path.join(folder, file));
    totalDuration += duration / 1000000; // Convert to seconds
  }

  // Optimize ffmpeg concatenation with better flags
  const command = `ffmpeg -hide_banner -y -f concat -safe 0 -i "${listfile}" -i "${metadatafile}" -map_metadata 1 -c copy -movflags +faststart "${filename}"`;

  const process = spawn(command, { shell: true });

  process.stderr.on("data", (data) => {
    const match = data.toString().match(/time=(\d+):(\d+):(\d+.\d+)/);
    if (match) {
      const [_, hours, minutes, seconds] = match;
      const timeInSeconds = hours * 3600 + minutes * 60 + parseFloat(seconds);
      const progress = Math.min(99, (timeInSeconds / totalDuration) * 100);
      progressBar.update(Math.floor(progress));
    }
  });

  return new Promise((resolve, reject) => {
    process.on("exit", (code) => {
      if (code === 0) {
        progressBar.update(100);
        multibar.stop();
        resolve();
      } else {
        multibar.stop();
        reject(new Error(`FFmpeg process exited with code ${code}`));
      }
    });

    process.on("error", (err) => {
      multibar.stop();
      reject(err);
    });
  });
}

if (require.main === module) {
  const folder = process.argv[2].replace(/"/g, "");
  const outputDir = path.join(
    path.dirname(folder),
    path.basename(folder) + "_repack"
  );

  // Create output directory
  fs.mkdirSync(outputDir, { recursive: true });

  title = path.basename(folder).replace(/"/g, "");

  const listAudioFiles = fs
    .readdirSync(folder)
    .filter((f) => f.includes(".m4a"));
  listAudioFiles.sort();

  const metadatafile = path.join(outputDir, "combined.metadata.txt");
  const listfile = path.join(outputDir, "list_audio_files.txt");

  // Create list file with relative paths
  const listContent = listAudioFiles
    .map((file) => `file '${path.resolve(folder, file)}'`)
    .join("\n");
  fs.writeFileSync(listfile, listContent);

  console.log("List file content:");
  console.log(listContent);

  makeChaptersMetadata(folder, listAudioFiles, outputDir, metadatafile)
    .then(() =>
      concatenateAllToOneWithChapters(
        outputDir,
        metadatafile,
        listfile,
        folder,
        listAudioFiles
      )
    )
    .then(() => {
      fs.unlinkSync(listfile);
      fs.unlinkSync(metadatafile);
    })
    .catch((error) => {
      console.error("Error:", error);
      process.exit(1);
    });
}
