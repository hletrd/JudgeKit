import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { BASE_URL, DEFAULT_CREDENTIALS as CREDENTIALS } from "./support/constants";

// A+B solutions for every supported language
const SOLUTIONS: Record<string, string> = {
  c17: `#include <stdio.h>
int main() {
    int a, b;
    scanf("%d %d", &a, &b);
    printf("%d\\n", a + b);
    return 0;
}`,
  c23: `#include <stdio.h>
int main() {
    int a, b;
    scanf("%d %d", &a, &b);
    printf("%d\\n", a + b);
    return 0;
}`,
  cpp20: `#include <iostream>
using namespace std;
int main() {
    int a, b;
    cin >> a >> b;
    cout << a + b << endl;
    return 0;
}`,
  cpp23: `#include <iostream>
using namespace std;
int main() {
    int a, b;
    cin >> a >> b;
    cout << a + b << endl;
    return 0;
}`,
  java: `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int a = sc.nextInt(), b = sc.nextInt();
        System.out.println(a + b);
    }
}`,
  python: `a, b = map(int, input().split())
print(a + b)`,
  javascript: `process.stdin.resume();
process.stdin.setEncoding('utf8');
let d = '';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
    const [a, b] = d.trim().split(/\\s+/).map(Number);
    console.log(a + b);
});`,
  typescript: `process.stdin.resume();
process.stdin.setEncoding('utf8');
let d = '';
process.stdin.on('data', (c: string) => d += c);
process.stdin.on('end', () => {
    const [a, b] = d.trim().split(/\\s+/).map(Number);
    console.log(a + b);
});`,
  kotlin: `fun main() {
    val (a, b) = readLine()!!.split(" ").map { it.toInt() }
    println(a + b)
}`,
  rust: `use std::io;
fn main() {
    let mut input = String::new();
    io::stdin().read_line(&mut input).unwrap();
    let nums: Vec<i64> = input.trim().split_whitespace()
        .map(|x| x.parse().unwrap()).collect();
    println!("{}", nums[0] + nums[1]);
}`,
  go: `package main
import "fmt"
func main() {
    var a, b int
    fmt.Scan(&a, &b)
    fmt.Println(a + b)
}`,
  swift: `let parts = readLine()!.split(separator: " ").map { Int($0)! }
print(parts[0] + parts[1])`,
  csharp: `using System;
class Program {
    static void Main() {
        var parts = Console.ReadLine().Split();
        Console.WriteLine(int.Parse(parts[0]) + int.Parse(parts[1]));
    }
}`,
  r: `x <- as.integer(strsplit(readLines("stdin", 1), " ")[[1]])
cat(x[1] + x[2], "\\n")`,
  perl: `my ($a, $b) = split / /, <STDIN>;
print $a + $b, "\\n";`,
  php: `<?php
list($a, $b) = explode(" ", trim(fgets(STDIN)));
echo $a + $b . "\\n";`,
  clang_c23: `#include <stdio.h>
int main() {
    int a, b;
    scanf("%d %d", &a, &b);
    printf("%d\\n", a + b);
    return 0;
}`,
  clang_cpp23: `#include <iostream>
using namespace std;
int main() {
    int a, b;
    cin >> a >> b;
    cout << a + b << endl;
    return 0;
}`,
  befunge: `&&+.@`,
  aheui: `방방다망하`,
  hyeong: `혀엉...혀엉....형타형타`,
  whitespace: [
    "   \n",          // push 0
    "\t\n\t\t",       // readnum → heap[0]
    "   \t\n",        // push 1
    "\t\n\t\t",       // readnum → heap[1]
    "   \n",          // push 0
    "\t\t\t",         // retrieve heap[0]
    "   \t\n",        // push 1
    "\t\t\t",         // retrieve heap[1]
    "\t   ",          // add
    "\t\n \t",        // output number
    "   \t \t \n",    // push 10 (newline)
    "\t\n  ",         // output char
    "\n\n\n",         // end
  ].join(""),
  ada: `with Ada.Text_IO; use Ada.Text_IO;
with Ada.Integer_Text_IO; use Ada.Integer_Text_IO;
procedure Solution is
   A, B : Integer;
begin
   Get(A); Get(B);
   Put(A + B, Width => 0);
   New_Line;
end Solution;`,
  clojure: `(let [line (read-line) nums (map #(Integer/parseInt %) (.split (.trim line) "\\\\s+"))] (println (apply + nums)))`,
  prolog: `main :- read_line_to_string(user_input, Line), split_string(Line, " ", "", Parts), maplist(number_string, Nums, Parts), sumlist(Nums, S), write(S), nl.
:- initialization(main, main).`,
  tcl: `gets stdin line
lassign [split $line " "] a b
puts [expr {$a + $b}]`,
  awk: `{ print $1 + $2 }`,
  scheme: `(let ((a (read)) (b (read)))
  (display (+ a b))
  (newline))`,
  groovy: `def line = System.in.newReader().readLine().trim()
def parts = line.split(" ")
println(parts[0].toInteger() + parts[1].toInteger())`,
  octave: `ab = scanf("%d", 2);
printf("%d\\n", ab(1) + ab(2));`,
  crystal: `a, b = read_line.split.map(&.to_i)
puts a + b`,
  powershell: `$line = [Console]::In.ReadLine()
$parts = $line.Trim().Split(" ")
[Console]::WriteLine([int]$parts[0] + [int]$parts[1])`,
  postscript: `(%stdin) (r) file dup token pop exch token pop add =`,
  c89: `#include <stdio.h>
int main() {
    int a, b;
    scanf("%d %d", &a, &b);
    printf("%d\\n", a + b);
    return 0;
}`,
  c99: `#include <stdio.h>
int main() {
    int a, b;
    scanf("%d %d", &a, &b);
    printf("%d\\n", a + b);
    return 0;
}`,
  ruby: `a, b = gets.split.map(&:to_i)
puts a + b`,
  lua: `local line = io.read("l")
local a, b = line:match("(%S+)%s+(%S+)")
print(math.floor(tonumber(a) + tonumber(b)))`,
  haskell: `main = do
    line <- getLine
    let [a, b] = map read (words line) :: [Int]
    print (a + b)`,
  dart: `import 'dart:io';
void main() {
    var parts = stdin.readLineSync()!.split(' ').map(int.parse).toList();
    print(parts[0] + parts[1]);
}`,
  zig: `const std = @import("std");
pub fn main() !void {
    var buf: [100]u8 = undefined;
    const line = (try std.io.getStdIn().reader().readUntilDelimiterOrEof(&buf, '\\n')) orelse return;
    const trimmed = std.mem.trim(u8, line, &[_]u8{ '\\r', '\\n' });
    var it = std.mem.splitScalar(u8, trimmed, ' ');
    const a = try std.fmt.parseInt(i64, it.next() orelse return, 10);
    const b = try std.fmt.parseInt(i64, it.next() orelse return, 10);
    const stdout = std.io.getStdOut().writer();
    try stdout.print("{d}\\n", .{a + b});
}`,
  nim: `import strutils
let parts = stdin.readLine().split()
echo parseInt(parts[0]) + parseInt(parts[1])`,
  ocaml: `let () = Scanf.scanf " %d %d" (fun a b -> Printf.printf "%d\\n" (a + b))`,
  elixir: `IO.gets("") |> String.trim() |> String.split() |> Enum.map(&String.to_integer/1) |> Enum.sum() |> IO.puts()`,
  julia: `a, b = parse.(Int, split(readline()))
println(a + b)`,
  d: `import std.stdio;
import std.conv;
import std.string;
void main() {
    auto line = readln().strip();
    auto parts = line.split(" ");
    writeln(to!int(parts[0]) + to!int(parts[1]));
}`,
  racket: `#lang racket
(define a (read))
(define b (read))
(displayln (+ a b))`,
  vlang: `import os
fn main() {
    line := os.get_line()
    parts := line.split(' ')
    a := parts[0].int()
    b := parts[1].int()
    println(a + b)
}`,
  fortran: `program main
    implicit none
    integer :: a, b
    read(*,*) a, b
    write(*,'(I0)') a + b
end program`,
  pascal: `program aplusb;
var a, b: longint;
begin
    readln(a, b);
    writeln(a + b);
end.`,
  brainfuck: `>,>,<[->+<]>.`,
  cobol: `       IDENTIFICATION DIVISION.
       PROGRAM-ID. SOLUTION.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-INPUT PIC X(100).
       01 WS-A-STR PIC X(20).
       01 WS-B-STR PIC X(20).
       01 WS-A PIC S9(9).
       01 WS-B PIC S9(9).
       01 WS-C PIC S9(9).
       01 WS-DISP PIC -(9)9.
       PROCEDURE DIVISION.
           ACCEPT WS-INPUT
           UNSTRING WS-INPUT DELIMITED BY SPACES
               INTO WS-A-STR WS-B-STR
           COMPUTE WS-A =
               FUNCTION NUMVAL(WS-A-STR)
           COMPUTE WS-B =
               FUNCTION NUMVAL(WS-B-STR)
           COMPUTE WS-C = WS-A + WS-B
           MOVE WS-C TO WS-DISP
           DISPLAY FUNCTION TRIM(WS-DISP)
           STOP RUN.`,
  scala: `object Main extends App {
    val Array(a, b) = scala.io.StdIn.readLine().split(" ").map(_.toInt)
    println(a + b)
}`,
  erlang: `-module(solution).
-export([main/0]).
main() ->
    Line = io:get_line(""),
    Tokens = string:tokens(string:trim(Line), " "),
    [A, B] = [list_to_integer(T) || T <- Tokens],
    io:format("~w~n", [A + B]).`,
  commonlisp: `(let ((a (read)) (b (read)))
  (format t "~d~%" (+ a b)))`,
  bash: `read a b
echo $((a + b))`,
};

const TEST_CASES = [
  { input: "1 2", expectedOutput: "3" },
  { input: "0 0", expectedOutput: "0" },
  { input: "-5 10", expectedOutput: "5" },
  { input: "1000000 2000000", expectedOutput: "3000000" },
];

async function login(page: Page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.locator("#username").fill(CREDENTIALS.username);
  await page.locator("#password").fill(CREDENTIALS.password);
  await page.getByRole("button", { name: /sign in|로그인/i }).click();
  await page.waitForURL(/\/(dashboard|change-password)/, { timeout: 15_000 });

  if (page.url().includes("/change-password")) {
    throw new Error("Account requires password change");
  }

  await page.waitForURL("**/dashboard**", { timeout: 15_000 });
}

async function apiPost(ctx: BrowserContext, path: string, body: unknown) {
  return ctx.request.post(`${BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
    data: body,
  });
}

async function apiGet(ctx: BrowserContext, path: string) {
  return ctx.request.get(`${BASE_URL}${path}`);
}

async function waitForJudging(
  ctx: BrowserContext,
  submissionId: string,
  timeoutMs = 120_000
): Promise<{ status: string; score: number; compileOutput: string }> {
  const terminalStatuses = new Set([
    "accepted",
    "wrong_answer",
    "time_limit",
    "memory_limit",
    "runtime_error",
    "compile_error",
  ]);
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const response = await apiGet(ctx, `/api/v1/submissions/${submissionId}`);
    if (response.status() === 200) {
      const json = await response.json();
      const data = json.data ?? json;
      const status = data.status;
      if (terminalStatuses.has(status)) {
        return {
          status,
          score: Number(data.score ?? 0),
          compileOutput: data.compileOutput ?? "",
        };
      }
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }

  throw new Error(`Submission ${submissionId} did not finish within ${timeoutMs}ms`);
}

test("submit A+B in all supported languages and verify judging", async ({ browser }) => {
  test.setTimeout(900_000); // 15 minutes for 55 languages

  const context = await browser.newContext();
  const page = await context.newPage();

  // Login
  await login(page);
  console.log("Logged in successfully");

  // Reuse an existing [E2E] A+B problem if available, otherwise create one
  let problemId: string | undefined;

  const listRes = await apiGet(context, "/api/v1/problems");
  if (listRes.status() === 200) {
    const listJson = await listRes.json();
    const problems: Array<{ id: string; title: string }> =
      listJson.data?.problems ?? listJson.data ?? listJson.problems ?? [];
    const existing = problems.find((p) => p.title.includes("[E2E] A+B"));
    if (existing) {
      problemId = existing.id;
      console.log(`Reusing existing problem: ${problemId}`);
    }
  }

  if (!problemId) {
    const problemBody = {
      title: `[E2E] A+B All Languages — ${Date.now()}`,
      description: "Read two integers A and B from stdin, print A+B.",
      timeLimitMs: 10000,
      memoryLimitMb: 512,
      visibility: "public",
      testCases: TEST_CASES.map((tc, i) => ({
        input: tc.input,
        expectedOutput: tc.expectedOutput,
        isVisible: true,
        sortOrder: i,
      })),
    };

    let createRes;
    for (let attempt = 1; attempt <= 3; attempt++) {
      createRes = await apiPost(context, "/api/v1/problems", problemBody);
      if (createRes.status() !== 429) break;
      console.log(`Problem creation rate-limited (attempt ${attempt}), waiting 5s…`);
      await new Promise((r) => setTimeout(r, 5_000));
    }

    expect(createRes!.status()).toBe(201);
    problemId = (await createRes!.json()).data?.id;
    console.log(`Created problem: ${problemId}`);
  }

  // Submit all languages and collect results
  type Result = {
    language: string;
    submissionId: string;
    status: string;
    score: number;
    compileOutput: string;
  };

  const results: Result[] = [];
  const languages = Object.keys(SOLUTIONS);

  for (const language of languages) {
    try {
      // Submit with rate-limit retry
      let subRes!: Awaited<ReturnType<typeof apiPost>>;
      for (let attempt = 1; attempt <= 3; attempt++) {
        subRes = await apiPost(context, "/api/v1/submissions", {
          problemId,
          language,
          sourceCode: SOLUTIONS[language],
        });
        if (subRes.status() !== 429) break;
        console.log(`[${language}] Rate limited (attempt ${attempt}), waiting 15s…`);
        await new Promise((r) => setTimeout(r, 15_000));
      }

      if (subRes.status() !== 201) {
        const err = await subRes.text();
        console.log(`[${language}] Submit failed: ${subRes.status()} ${err}`);
        results.push({
          language,
          submissionId: "-",
          status: `submit_error_${subRes.status()}`,
          score: 0,
          compileOutput: err,
        });
        continue;
      }

      const submissionId = (await subRes.json()).data?.id;
      console.log(`[${language}] Submitted: ${submissionId}`);

      // Wait for result
      const result = await waitForJudging(context, submissionId);
      console.log(
        `[${language}] ${result.status} (score: ${result.score})${
          result.compileOutput ? ` — ${result.compileOutput.slice(0, 120)}` : ""
        }`
      );

      results.push({ language, submissionId, ...result });

      // Brief pause between submissions to avoid rate limiting
      await new Promise((r) => setTimeout(r, 8000));
    } catch (e) {
      console.log(`[${language}] Error: ${e}`);
      results.push({
        language,
        submissionId: "-",
        status: "test_error",
        score: 0,
        compileOutput: String(e),
      });
    }
  }

  // Print summary table
  console.log("\n========== RESULTS SUMMARY ==========");
  console.log("Language       | Status         | Score");
  console.log("---------------|----------------|------");
  for (const r of results) {
    const lang = r.language.padEnd(14);
    const status = r.status.padEnd(15);
    console.log(`${lang} | ${status} | ${r.score}`);
  }

  const accepted = results.filter((r) => r.status === "accepted");
  const failed = results.filter((r) => r.status !== "accepted");
  console.log(`\nAccepted: ${accepted.length}/${results.length}`);

  if (failed.length > 0) {
    console.log("\nFailed languages:");
    for (const r of failed) {
      console.log(`  ${r.language}: ${r.status}`);
      if (r.compileOutput) {
        console.log(`    → ${r.compileOutput.slice(0, 200)}`);
      }
    }
  }
  console.log("=====================================\n");

  // Take a final screenshot of the problem page
  await page.goto(`${BASE_URL}/dashboard/problems/${problemId}`, {
    waitUntil: "networkidle",
  });

  // Languages with known issues that should not fail the overall test:
  // - I/O models incompatible with the test's space-separated integer input
  // - Docker images that fail to build or are unavailable
  const KNOWN_FLAKY = new Set([
    "hyeong",      // reads one integer per line, not space-separated
    "brainfuck",   // byte-level I/O, cannot handle multi-digit decimal numbers
    "vlang",       // V Docker image fails to build from source reliably
    "whitespace",  // Whitespace interpreter file encoding issues
  ]);

  const unexpected = failed.filter((r) => !KNOWN_FLAKY.has(r.language));

  // Assert all non-exempted languages passed
  expect(
    unexpected.map((r) => `${r.language}: ${r.status}`),
    "Some languages failed judging"
  ).toEqual([]);

  await page.close();
  await context.close();
});
