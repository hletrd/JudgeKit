import sys, json
class Solution:
    def twoSum(self, nums, target):
        seen = {}
        for i, x in enumerate(nums):
            if target - x in seen:
                return [seen[target - x], i]
            seen[x] = i
        return []


def _main():
    args = json.loads(sys.stdin.readline())
    result = Solution().twoSum(*args)
    sys.stdout.write(json.dumps(result, separators=(",", ":")))

if __name__ == "__main__":
    _main()
