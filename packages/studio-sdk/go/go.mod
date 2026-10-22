module github.com/dsswift/ion/packages/studio-sdk/go

go 1.25.0

require github.com/dsswift/ion/sdk/go v0.0.0-00010101000000-000000000000

// Inside this repository the engine's Go SDK comes from the engine checkout,
// a clone of dsswift/ion beside this one (../ion). An installed copy of this
// module sits at ~/.ion/extensions/studio-sdk-go/, next to
// ~/.ion/extensions/sdk-go/, and the installer rewrites this line to
// `../sdk-go` (see desktop/src/main/studio-sdk-install.ts).
replace github.com/dsswift/ion/sdk/go => ../../../../ion/sdk/go
