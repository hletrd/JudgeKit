package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"sort"
	"strconv"
	"strings"
)

var (
	_ = math.Abs
	_ = sort.Ints
	_ = strconv.Itoa
	_ = strings.Split
)

func __decode(raw json.RawMessage, dst any) {
	if err := json.Unmarshal(raw, dst); err != nil {
		fmt.Fprintln(os.Stderr, "json:", err)
		os.Exit(1)
	}
}

func twoSum(nums []int64, target int64) []int64 {
	seen := map[int64]int64{}
	for i, x := range nums {
		if j, ok := seen[target-x]; ok {
			return []int64{j, int64(i)}
		}
		seen[x] = int64(i)
	}
	return []int64{}
}


func main() {
	__reader := bufio.NewReader(os.Stdin)
	__line, _ := __reader.ReadString('\n')
	var __raw []json.RawMessage
	__decode(json.RawMessage(__line), &__raw)
	var nums []int64
	__decode(__raw[0], &nums)
	var target int64
	__decode(__raw[1], &target)
	__result := twoSum(nums, target)
	// Encoder with SetEscapeHTML(false) keeps <, >, & raw — matching the
	// canonical JSON.stringify contract in serialization.ts and the other
	// adapters. json.Marshal's default escapes them to \u003c/\u003e/\u0026,
	// which would byte-diverge expected/actual for string returns judged
	// cross-language. The encoder appends a trailing newline; trim it so the
	// output stays a single compact JSON value like the other adapters.
	var __buf strings.Builder
	__enc := json.NewEncoder(&__buf)
	__enc.SetEscapeHTML(false)
	if __err := __enc.Encode(__result); __err != nil {
		fmt.Fprintln(os.Stderr, "json:", __err)
		os.Exit(1)
	}
	os.Stdout.WriteString(strings.TrimRight(__buf.String(), "\n"))
}
