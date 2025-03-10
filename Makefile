.PHONY: build build-extension build-wasm-ui bench-one

build: build-extension build-wasm-ui build-wasm

build-prod: build-extension-prod build-wasm-ui-prod build-wasm
	
build-wasm:
	GOOS=js GOARCH=wasm go build -o dist/main.wasm

build-extension:
	node esbuild.js --extension-only

build-wasm-ui:
	node esbuild.js --wasm-ui-only
	
build-extension-prod:
	node esbuild.js --extension-only --production

build-wasm-ui-prod:
	node esbuild.js --wasm-ui-only --production


watch:
	node esbuild.js --watch

bench-one:
	(cd test && go test -bench=. -benchmem -run=^$$ -count=5 > ../testdata/benchone.txt)