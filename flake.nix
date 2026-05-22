{
  description = "Symphony - Long-running coding agent automation service";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  };

  outputs =
    { nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems =
        f:
        nixpkgs.lib.genAttrs systems (
          system:
          f (
            import nixpkgs {
              inherit system;
            }
          )
        );
    in
    {
      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          packages = [
            pkgs.nodejs_24
            pkgs.pnpm
            pkgs.git
            pkgs.curl
            pkgs.jq
            pkgs.direnv
            pkgs.nix-direnv
          ];

          shellHook = ''
            echo "Symphony dev shell"
            echo "  node  $(node --version)"
            echo "  pnpm  $(pnpm --version)"
          '';
        };
      });
    };
}
