package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
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
	__out, __err := json.Marshal(__result)
	if __err != nil {
		fmt.Fprintln(os.Stderr, "json:", __err)
		os.Exit(1)
	}
	os.Stdout.Write(__out)
}
