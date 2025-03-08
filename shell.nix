{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = with pkgs; [
    nodejs
    google-chrome
    chromedriver
    ffmpeg
  ];

  shellHook = ''
    export CHROME_BIN="${pkgs.google-chrome}/bin/google-chrome-stable"
    export CHROMEDRIVER_PATH="${pkgs.chromedriver}/bin/chromedriver"
    export PATH="${pkgs.chromedriver}/bin:$PATH"
    
    # Verify paths exist
    if [ ! -f "$CHROME_BIN" ]; then
      echo "ERROR: Chrome binary not found at $CHROME_BIN"
      exit 1
    fi
    if [ ! -f "$CHROMEDRIVER_PATH" ]; then
      echo "ERROR: ChromeDriver not found at $CHROMEDRIVER_PATH"
      exit 1
    fi
    
    echo "Node.js version: $(node --version)"
    echo "Chrome binary: $CHROME_BIN"
    echo "Chrome version: $($CHROME_BIN --version)"
    echo "ChromeDriver version: $(chromedriver --version)"
    echo "FFmpeg version: $(ffmpeg -version | head -n1)"
    echo "ch.rip development environment ready!"
  '';
}