# ch.rip - chirp eBook downloader

Chapter Rip (ch.rip) is a tool to download an optionally pack the audio files for the books you have purchased on chirp. It should work on Windows, Linux, and MacOS.

This project owes a lot to the automation orginally from https://gist.github.com/nfriedly/1d0f81fd68addd594d4974923205c384 the sequence of which is maintained here.

## Setup

First download and unzip this repository

There are some prerequisites please install these now:
* chrome - https://www.google.com/chrome/dr/download - needed because we have to use a chrome extension (ext folder)
* node.js - https://nodejs.org/en/download/prebuilt-installer - runs the control script

For repacking books you will also need
* ffmpeg - https://ffmpeg.org/ - THE swiss army knife for media file manipulation

### Process
* Install the above components.
* Navigate your command line to the directory containing this readmey then run `npm install`. This installs the selenium webdriver we need.
* Done!

## Usage
 *Have you got the prerequisites setup? OK good!*

----
### Downloading files
##### Step 1
Navigate your command line to the directory containing this readme then run
> `node chrip.js`

##### Step 2
Login as prompted

##### Step 3
The browser will navigate to the My Library tab. Select the book you want to download.

##### Step 4
* Go to the first chapter of the book!! 
* Press the play button

The script will now jump through all the chapters snooping on and downloading the files for you.
Files will be in a subfolder next to this script.

##### Step 5
The script closes the book tab. You may now select another book or exit the browser window.

----
### Repacking books
Repacking books converts the folder of chapter files into a single audiobook file with chapter metadata and book cover. This make it easier to transfer your books to your mobile device.

##### Step 1
Navigate your command line to the directory containing this readme then run
> `node repack.js FOLDER_NAME`

##### Step 2
Delete the book folder if you don't need the individal chapters

## Development

If you're using Nix, you can enter a development shell with all dependencies:

```bash
nix-shell
```

This will provide nodejs, chrome, and ffmpeg automatically.

