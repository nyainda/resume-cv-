{pkgs}: {
  deps = [
    pkgs.cups
    pkgs.expat
    pkgs.dbus
    pkgs.glib
    pkgs.cairo
    pkgs.pango
    pkgs.gtk3
    pkgs.libxkbcommon
    pkgs.xorg.libXrandr
    pkgs.xorg.libXfixes
    pkgs.xorg.libXext
    pkgs.xorg.libXdamage
    pkgs.xorg.libXcomposite
    pkgs.xorg.libxcb
    pkgs.xorg.libX11
    pkgs.at-spi2-atk
    pkgs.atk
    pkgs.nspr
    pkgs.nss
    pkgs.chromium
  ];
}
