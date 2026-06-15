function twoSum(nums: number[], target: number): number[] {
  const seen = new Map<number, number>();
  for (let i = 0; i < nums.length; i++) {
    const need = target - nums[i];
    if (seen.has(need)) return [seen.get(need)!, i];
    seen.set(nums[i], i);
  }
  return [];
}


const __input: string = require("fs").readFileSync(0, "utf8");
const __args: unknown[] = JSON.parse(__input.split("\n")[0]);
const __result = (twoSum as (...args: unknown[]) => unknown)(...__args);
process.stdout.write(JSON.stringify(__result));
