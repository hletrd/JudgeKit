function twoSum(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i++) {
    const need = target - nums[i];
    if (seen.has(need)) return [seen.get(need), i];
    seen.set(nums[i], i);
  }
  return [];
}


const __input = require("fs").readFileSync(0, "utf8");
const __args = JSON.parse(__input.split("\n")[0]);
const __result = twoSum(...__args);
process.stdout.write(JSON.stringify(__result));
