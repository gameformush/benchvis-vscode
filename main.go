package main

import (
	"benchvis/pkg/benchvis"
	"bytes"
	"encoding/json"
	"syscall/js"
)

type benchFilesArgs struct {
	Paths []string `json:"paths"`
	Data  []string `json:"data"`
}
type benchStatArgs struct {
	Paths  []string        `json:"paths"`
	Data   []string        `json:"data"`
	Config benchvis.Config `json:"config"`
}

func parseBenchmarkFiles(this js.Value, callArgs []js.Value) any {
	var args benchFilesArgs
	err := json.Unmarshal([]byte(callArgs[0].String()), &args)
	if err != nil {
		return js.ValueOf(map[string]any{
			"error": err.Error(),
		})
	}

	results, _, err := benchvis.ParseBenchmarkFiles(args.Paths, args.Data)
	if err != nil {
		return js.ValueOf(map[string]any{
			"error": err.Error(),
		})
	}

	dataBy, err := json.Marshal(results)
	if err != nil {
		return js.ValueOf(map[string]any{
			"error": err.Error(),
		})
	}

	return js.ValueOf(map[string]any{
		"data":  string(dataBy),
		"error": nil,
	})
}

type BenchstatFormat int

const (
	JSONFormat BenchstatFormat = iota
	TextFormat
	CSVFormat
)

func buildBenchstat(this js.Value, callArgs []js.Value, format BenchstatFormat) any {
	var args benchStatArgs
	err := json.Unmarshal([]byte(callArgs[0].String()), &args)
	if err != nil {
		return js.ValueOf(map[string]any{
			"error": err.Error(),
		})
	}

	stats, err := benchvis.BuildBenchstat(args.Config, args.Paths, args.Data)
	if err != nil {
		return js.ValueOf(map[string]any{
			"error": err.Error(),
		})
	}

	buffer := bytes.NewBuffer(nil)
	switch format {
	case JSONFormat:
		err = stats.ToJSON(buffer)
	case TextFormat:
		err = stats.ToText(buffer, false)
	case CSVFormat:
		err = stats.ToCSV(buffer, bytes.NewBuffer(nil))
	default:
		return js.ValueOf(map[string]any{
			"error": err.Error(),
		})
	}
	return js.ValueOf(map[string]any{
		"data":  buffer.String(),
		"error": nil,
	})
}

func BuildBenchstat(this js.Value, callArgs []js.Value) any {
	return buildBenchstat(this, callArgs, JSONFormat)
}

func BuildBenchstatText(this js.Value, callArgs []js.Value) any {
	return buildBenchstat(this, callArgs, TextFormat)
}

func BuildBenchstatCSV(this js.Value, callArgs []js.Value) any {
	return buildBenchstat(this, callArgs, CSVFormat)
}

func main() {
	js.Global().Set("parseBenchmarkFiles", js.FuncOf(parseBenchmarkFiles))
	js.Global().Set("buildBenchstat", js.FuncOf(BuildBenchstat))
	js.Global().Set("buildBenchstatText", js.FuncOf(BuildBenchstatText))
	js.Global().Set("buildBenchstatCsv", js.FuncOf(BuildBenchstatCSV))

	println("wait")

	select {}
}
