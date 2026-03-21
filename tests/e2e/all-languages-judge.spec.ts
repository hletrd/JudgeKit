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
  // Algorithm: read all 4 chars of "d1 d2\n" into stack 0 as code points,
  // sum them (e.g. 49+32+50+10=141), subtract 45 twice via type-3 negation
  // (141-45-45=51), then push the result to stack 1 (stdout) as a Unicode char.
  // Works because output_char = char1 + char2 - 48, and
  // sum_all - 90 = (d1+48) + 32 + (d2+48) + 10 - 90 = d1 + d2 + 48. ✓
  hyeong: `흐윽하하하앙형.............................................형.............................................흐읏....하하앙.`,
  // Whitespace A+B built with explicit char codes to avoid encoding issues.
  // S=space(0x20) T=tab(0x09) L=linefeed(0x0A)
  whitespace: [
    "SSSL",      // push 0   (heap address)
    "SLS",       // dup
    "TLTT",      // readnum  → heap[0]
    "SSSTL",     // push 1   (heap address)
    "SLS",       // dup
    "TLTT",      // readnum  → heap[1]
    "SSSL",      // push 0
    "TTT",       // retrieve  heap[0]
    "SSSTL",     // push 1
    "TTT",       // retrieve  heap[1]
    "TSSS",      // add
    "TLST",      // outnum
    "LLL",       // end
  ]
    .join("")
    .replace(/S/g, " ")
    .replace(/T/g, "\t")
    .replace(/L/g, "\n"),
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
  brainfuck: `,>,,<[->+<]>------------------------------------------------.`,
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
  delphi: `program Solution;
var a, b: Integer;
begin
  Read(a, b);
  WriteLn(a + b);
end.`,
  fsharp: `open System
let line = Console.ReadLine()
let parts = line.Split(' ')
let a = int parts.[0]
let b = int parts.[1]
printfn "%d" (a + b)`,
  apl: `⎕←+/⎕\n)OFF`,
  freebasic: `Dim As Integer a, b
Input a, b
Print Str(a + b)`,
  smalltalk: `| line parts a b |
line := stdin nextLine.
parts := line subStrings: $ .
a := (parts at: 1) asInteger.
b := (parts at: 2) asInteger.
Transcript show: (a + b) printString; cr.`,
  b: `main() {
    extrn getchar, printf;
    auto a, b, c;
    a = 0; b = 0;
    c = getchar();
    while(c != ' ') { a = a * 10 + c - '0'; c = getchar(); }
    c = getchar();
    while(c != 10 & c != -1) { b = b * 10 + c - '0'; c = getchar(); }
    printf("%d*n", a + b);
}`,
  sed: `s/\\([0-9]\\) \\([0-9]\\)/\\1+\\2/
s/0+0/0/;s/0+1/1/;s/0+2/2/;s/0+3/3/;s/0+4/4/;s/0+5/5/;s/0+6/6/;s/0+7/7/;s/0+8/8/;s/0+9/9/
s/1+0/1/;s/1+1/2/;s/1+2/3/;s/1+3/4/;s/1+4/5/;s/1+5/6/;s/1+6/7/;s/1+7/8/;s/1+8/9/
s/2+0/2/;s/2+1/3/;s/2+2/4/;s/2+3/5/;s/2+4/6/;s/2+5/7/;s/2+6/8/;s/2+7/9/
s/3+0/3/;s/3+1/4/;s/3+2/5/;s/3+3/6/;s/3+4/7/;s/3+5/8/;s/3+6/9/
s/4+0/4/;s/4+1/5/;s/4+2/6/;s/4+3/7/;s/4+4/8/;s/4+5/9/
s/5+0/5/;s/5+1/6/;s/5+2/7/;s/5+3/8/;s/5+4/9/
s/6+0/6/;s/6+1/7/;s/6+2/8/;s/6+3/9/
s/7+0/7/;s/7+1/8/;s/7+2/9/
s/8+0/8/;s/8+1/9/
s/9+0/9/`,
  dc: `? + p`,
  coffeescript: `process.stdin.resume()
process.stdin.setEncoding 'utf8'
d = ''
process.stdin.on 'data', (c) -> d += c
process.stdin.on 'end', ->
  [a, b] = d.trim().split(/\\s+/).map Number
  console.log a + b`,
  llvm_ir: `declare i32 @scanf(ptr, ...)
declare i32 @printf(ptr, ...)

@.str_in = private constant [6 x i8] c"%d %d\\00"
@.str_out = private constant [4 x i8] c"%d\\0A\\00"

define i32 @main() {
  %a = alloca i32
  %b = alloca i32
  call i32 (ptr, ...) @scanf(ptr @.str_in, ptr %a, ptr %b)
  %va = load i32, ptr %a
  %vb = load i32, ptr %b
  %sum = add i32 %va, %vb
  call i32 (ptr, ...) @printf(ptr @.str_out, i32 %sum)
  ret i32 0
}`,
  vbnet: `Imports System
Module Program
    Sub Main()
        Dim parts = Console.ReadLine().Split(" "c)
        Console.WriteLine(Integer.Parse(parts(0)) + Integer.Parse(parts(1)))
    End Sub
End Module`,
  nasm: `section .bss
buf resb 16

section .text
global _start

_start:
    mov rax, 0
    mov rdi, 0
    lea rsi, [buf]
    mov rdx, 16
    syscall
    xor rbx, rbx
    lea rsi, [buf]
.p1:
    movzx rax, byte [rsi]
    cmp al, ' '
    je .sep
    sub al, '0'
    imul rbx, 10
    add rbx, rax
    inc rsi
    jmp .p1
.sep:
    inc rsi
    xor rcx, rcx
.p2:
    movzx rax, byte [rsi]
    cmp al, 10
    je .dp
    cmp al, 0
    je .dp
    sub al, '0'
    imul rcx, 10
    add rcx, rax
    inc rsi
    jmp .p2
.dp:
    add rbx, rcx
    lea rdi, [buf+15]
    mov byte [rdi], 10
    dec rdi
    mov rax, rbx
    mov rcx, 10
.ts:
    xor rdx, rdx
    div rcx
    add dl, '0'
    mov [rdi], dl
    dec rdi
    test rax, rax
    jnz .ts
    inc rdi
    mov rax, 1
    mov rsi, rdi
    lea rdx, [buf+16]
    sub rdx, rdi
    mov rdi, 1
    syscall
    mov rax, 60
    xor rdi, rdi
    syscall`,
  bqn: `l ← •GetLine@
w ← ' '((⊢-˜+\`×·¬⊢)∘=⊔⊢)l
•Out •Repr +´•BQN¨w`,
  lolcode: `HAI 1.2
I HAS A a ITZ 0
I HAS A b ITZ 0
GIMMEH a
GIMMEH b
a IS NOW A NUMBR
b IS NOW A NUMBR
VISIBLE SUM OF a AN b
KTHXBYE`,
  forth: `: main pad 80 stdin read-line throw drop pad swap evaluate + . cr ;
main`,
  algol68: `BEGIN
  INT a, b;
  read((a, b));
  print((whole(a + b, 0), new line))
END`,
  umjunsik: `어떻게
엄식?
어엄식?
동탄어?준........
엄어,
어엄어어.
준....
식어어!
이 사람이름이냐ㅋㅋ`,
  haxe: `class Solution {
  static function main() {
    var line = Sys.stdin().readLine();
    var parts = line.split(" ");
    var a = Std.parseInt(parts[0]);
    var b = Std.parseInt(parts[1]);
    Sys.println(a + b);
  }
}`,
  raku: `my ($a, $b) = get.words;
say $a + $b;`,
  shakespeare: `The Sum of Two Numbers.

Romeo, a young man.
Juliet, a young woman.

Act I: Reading and summing.

Scene I: Read the first number.

[Enter Romeo and Juliet]

Juliet: Listen to your heart!

Scene II: Read the second number.

Romeo: Listen to your heart!

Scene III: The sum.

Juliet: You are the sum of yourself and me.
Juliet: Open your heart!

[Exeunt]`,
  snobol4: `        INPUT BREAK(' ') . A ' ' REM . B
        OUTPUT = A + B
END`,
  icon: `procedure main()
    line := read()
    line ? {
        a := integer(tab(upto(' ')))
        move(1)
        b := integer(tab(0))
    }
    write(a + b)
end`,
  uiua: `&p/+⊜⋕≠@ .&sc`,
  odin: `package main

import "core:fmt"
import "core:os"
import "core:strings"
import "core:strconv"

main :: proc() {
    buf: [256]byte
    n, _ := os.read(os.stdin, buf[:])
    line := strings.trim_right(string(buf[:n]), "\\n\\r")
    parts := strings.split(line, " ")
    a := strconv.atoi(parts[0])
    b := strconv.atoi(parts[1])
    fmt.println(a + b)
}`,
  objective_c: `#include <stdio.h>
int main() {
    int a, b;
    scanf("%d %d", &a, &b);
    printf("%d\\n", a + b);
    return 0;
}`,
  deno_js: `const input = await new Response(Deno.stdin.readable).text();
const [a, b] = input.trim().split(/\\s+/).map(Number);
console.log(a + b);`,
  deno_ts: `const input: string = await new Response(Deno.stdin.readable).text();
const [a, b] = input.trim().split(/\\s+/).map(Number);
console.log(a + b);`,
  bun_js: `const input = await Bun.stdin.text();
const [a, b] = input.trim().split(/\\s+/).map(Number);
console.log(a + b);`,
  bun_ts: `const input: string = await Bun.stdin.text();
const [a, b] = input.trim().split(/\\s+/).map(Number);
console.log(a + b);`,
  gleam: `import gleam/io
import gleam/int
import gleam/string

@external(erlang, "io", "get_line")
fn get_line(prompt: String) -> String

pub fn main() {
  let line = get_line("")
  let trimmed = string.trim(line)
  let assert [a_str, b_str] = string.split(trimmed, " ")
  let assert Ok(a) = int.parse(a_str)
  let assert Ok(b) = int.parse(b_str)
  io.println(int.to_string(a + b))
}`,
  sml: `val () = let
  val line = case TextIO.inputLine TextIO.stdIn of SOME s => s | NONE => ""
  val nums = List.mapPartial Int.fromString (String.tokens Char.isSpace line)
  val sum = List.foldl op+ 0 nums
in print (Int.toString sum ^ "\\n") end;`,
  fennel: `(let [line (io.read :l)
      (a b) (line:match "(%S+)%s+(%S+)")]
  (print (math.floor (+ (tonumber a) (tonumber b)))))`,
  flix: `import java.nio.file.Files
import java.nio.file.Path

def main(): Unit \\ IO =
    let content = Files.readString(Path.of("/tmp/in"));
    let parts = String.split({regex = " "}, String.trim(content));
    let a = List.head(parts) |> Option.flatMap(Int32.fromString) |> Option.getWithDefault(0);
    let b = List.drop(1, parts) |> List.head |> Option.flatMap(Int32.fromString) |> Option.getWithDefault(0);
    println(Int32.toString(a + b))`,
  micropython: `a, b = map(int, input().split())
print(a + b)`,
  squirrel: `local line = ""
local c
while (true) {
    try { c = stdin.readn('b') } catch(e) { break }
    if (c == 10 || c == null) break
    line = line + c.tochar()
}
local sp = line.find(" ")
local a = line.slice(0, sp).tointeger()
local b = line.slice(sp + 1).tointeger()
print(a + b + "\\n")`,
  rexx: `parse pull a b
say a + b`,
  hy: `(setv parts (.split (input)))
(setv a (int (get parts 0)))
(setv b (int (get parts 1)))
(print (+ a b))`,
  arturo: `line: input ""
parts: split line " "
print (to :integer first parts) + (to :integer last parts)`,
  janet: `(def line (string/trim (file/read stdin :line)))
(def parts (string/split " " line))
(def a (scan-number (get parts 0)))
(def b (scan-number (get parts 1)))
(print (+ a b))`,
  c3: `module solution;
import std::io;
extern fn int scanf(char *fmt, ...);
extern fn int printf(char *fmt, ...);
fn int main() {
    int a;
    int b;
    scanf("%d %d", &a, &b);
    printf("%d\\n", a + b);
    return 0;
}`,
  vala: `void main() {
    int a, b;
    stdin.scanf("%d", out a);
    stdin.scanf("%d", out b);
    stdout.printf("%d\\n", a + b);
}`,
  nelua: `local function scanf(fmt: cstring, ...: cvarargs): cint <cimport, nodecl> end
local a: cint, b: cint
scanf('%d %d', &a, &b)
print(a + b)`,
  hare: `use fmt;
use os;
use bufio;
use strconv;
use strings;

export fn main() void = {
    const line = bufio::read_line(os::stdin)! as []u8;
    defer free(line);
    const s = strings::fromutf8(line)!;
    const tok = strings::tokenize(s, " ");
    const a = strconv::stoi(strings::next_token(&tok) as str)!;
    const b = strconv::stoi(strings::next_token(&tok) as str)!;
    fmt::printfln("{}", a + b)!;
};`,
  koka: `fun main()
  val line = readline()
  val parts = line.trim.split(" ")
  val a = parts[0].default("0").parse-int.default(0)
  val b = parts[1].default("0").parse-int.default(0)
  println( (a + b).show )`,
  lean: `def main : IO Unit := do
  let line ← (← IO.getStdin).getLine
  let parts := line.trim.splitOn " "
  match parts with
  | [a, b] => IO.println s!"{a.toInt! + b.toInt!}"
  | _ => return ()`,
};

// Keep inputs as positive single-digit numbers with single-digit sums (≤ 9)
// so that esoteric languages (brainfuck, whitespace) with byte-level I/O can
// handle them without multi-digit parsing/output routines.
const TEST_CASES = [
  { input: "1 2\n", expectedOutput: "3" },
  { input: "3 4\n", expectedOutput: "7" },
  { input: "0 5\n", expectedOutput: "5" },
  { input: "2 1\n", expectedOutput: "3" },
];

async function login(page: Page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "load" });
  await page.locator("#username").fill(CREDENTIALS.username);
  await page.locator("#password").fill(CREDENTIALS.password);
  await page.getByRole("button", { name: /sign in|로그인|signing/i }).click();
  await page.waitForURL(/\/(dashboard|change-password)/, { timeout: 60_000 });

  if (page.url().includes("/change-password")) {
    throw new Error("Account requires password change");
  }
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

async function apiDelete(ctx: BrowserContext, path: string) {
  return ctx.request.delete(`${BASE_URL}${path}`, {
    headers: {
      "X-Requested-With": "XMLHttpRequest",
    },
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
    await new Promise((r) => setTimeout(r, 1_000));
  }

  throw new Error(`Submission ${submissionId} did not finish within ${timeoutMs}ms`);
}

// ── Shared state for serial test suite ──
// Languages with known issues on the current judge infrastructure.
// Tagged test.fixme() so they show as "to-do" rather than failures.
const KNOWN_FAILING = new Set<string>([
  "fsharp",    // .NET SDK build instability
  "vbnet",     // .NET SDK build instability
  "nasm",      // x86 asm — arch-dependent, fails on aarch64
  "bqn",       // interpreter availability
  "lolcode",   // interpreter availability
  "forth",     // gforth stdin handling
  "algol68",   // compiler availability
  "micropython",  // newly added — pending Docker image build
  "squirrel",     // newly added — pending Docker image build
  "rexx",         // newly added — pending Docker image build
  "hy",           // newly added — pending Docker image build
  "arturo",       // newly added — pending Docker image build
  "janet",        // newly added — pending Docker image build
  "c3",           // newly added — pending Docker image build
  "vala",         // newly added — pending Docker image build
  "nelua",        // newly added — pending Docker image build
  "hare",         // newly added — pending Docker image build
  "koka",         // newly added — pending Docker image build
  "lean",         // newly added — pending Docker image build
]);

const KNOWN_FLAKY = new Set<string>([]);

/** Per-language timeout overrides (ms). JVM/compiled languages get more time. */
const LANGUAGE_TIMEOUTS: Record<string, number> = {
  scala: 180_000,
  haskell: 180_000,
  erlang: 150_000,
  gleam: 150_000,
  sml: 150_000,
  flix: 180_000,
  java: 120_000,
  kotlin: 120_000,
  groovy: 120_000,
  dart: 120_000,
  csharp: 120_000,
  c3: 120_000,
  vala: 120_000,
  nelua: 120_000,
  hare: 120_000,
  koka: 150_000,
  lean: 180_000,
};

let sharedContext: Awaited<ReturnType<typeof import("@playwright/test").chromium.launch>> extends { newContext: infer F } ? never : never;
let problemId: string;
let ctx: import("@playwright/test").BrowserContext;
let submissionIds: Map<string, string> = new Map();

test.describe("Judge all supported languages", () => {
  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    const page = await ctx.newPage();
    await login(page);

    // Delete stale E2E problems
    const listRes = await apiGet(ctx, "/api/v1/problems");
    if (listRes.status() === 200) {
      const listJson = await listRes.json();
      const problems: Array<{ id: string; title: string }> =
        listJson.data?.problems ?? listJson.data ?? listJson.problems ?? [];
      const existing = problems.find((p) => p.title.includes("[E2E] A+B"));
      if (existing) await apiDelete(ctx, `/api/v1/problems/${existing.id}`);
    }

    const createRes = await apiPost(ctx, "/api/v1/problems", {
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
    });
    if (createRes.status() === 201) {
      problemId = (await createRes.json()).data?.id;
    }

    // Submit all languages with retry logic for rate-limited responses
    const languages = Object.keys(SOLUTIONS).filter(l => !KNOWN_FAILING.has(l));

    async function submitWithRetry(language: string, maxRetries = 3): Promise<void> {
      const code = (SOLUTIONS as Record<string, string>)[language];
      if (!code) return;
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const res = await apiPost(ctx, "/api/v1/submissions", {
            problemId,
            language,
            sourceCode: code,
          });
          if (res.status() === 201) {
            const id = (await res.json()).data?.id;
            if (id) submissionIds.set(language, id);
            return;
          }
          if (res.status() === 429) {
            // Rate limited — back off and retry
            const retryAfter = parseInt(res.headers()["retry-after"] ?? "5", 10);
            await new Promise((r) => setTimeout(r, (retryAfter + 1) * 1000));
            continue;
          }
          // Non-retryable error — let the individual test handle it
          return;
        } catch { /* ignore, test will handle */ }
      }
    }

    // Stagger submissions in small batches to avoid rate limiting
    const BATCH_SIZE = 10;
    for (let i = 0; i < languages.length; i += BATCH_SIZE) {
      const batch = languages.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map((lang) => submitWithRetry(lang)));
      if (i + BATCH_SIZE < languages.length) {
        await new Promise((r) => setTimeout(r, 1000)); // 1s between batches
      }
    }
  });

  test.afterAll(async () => { await ctx?.close(); });

  // Generate one test per language
  for (const language of Object.keys(SOLUTIONS)) {
    const isFailing = KNOWN_FAILING.has(language);
    const isFlaky = KNOWN_FLAKY.has(language);
    const langTimeout = LANGUAGE_TIMEOUTS[language] ?? 120_000;

    // Known-failing languages: mark as fixme so they appear as "todo" not "fail"
    const testFn = isFailing ? test.fixme : test;

    testFn(`${language}${isFlaky ? " (flaky)" : ""}`, async () => {
      test.setTimeout(langTimeout);
      if (!problemId) { test.skip(true, "setup failed"); return; }

      try {
        let submissionId = submissionIds.get(language);

        if (!submissionId) {
          // Not pre-submitted — try now with retry for rate limiting
          for (let attempt = 0; attempt < 3; attempt++) {
            const subRes = await apiPost(ctx, "/api/v1/submissions", {
              problemId,
              language,
              sourceCode: (SOLUTIONS as Record<string, string>)[language],
            });

            if (subRes.status() === 201) {
              submissionId = (await subRes.json()).data?.id;
              break;
            }
            if (subRes.status() === 429) {
              const retryAfter = parseInt(subRes.headers()["retry-after"] ?? "5", 10);
              await new Promise((r) => setTimeout(r, (retryAfter + 1) * 1000));
              continue;
            }
            const err = await subRes.text();
            if (isFlaky) { test.skip(true, `submit ${subRes.status()}`); return; }
            expect.soft(subRes.status(), `Submit failed: ${err}`).toBe(201);
            return;
          }
          if (!submissionId) { test.skip(true, "no submission id after retries"); return; }
        }

        const result = await waitForJudging(ctx, submissionId, langTimeout);

        if (isFlaky && result.status !== "accepted") {
          test.skip(true, `${result.status}: ${result.compileOutput?.slice(0, 80) ?? ""}`);
          return;
        }

        // Detailed failure diagnostics
        const diagnosticMsg = [
          `Language: ${language}`,
          `Status: ${result.status}`,
          `Score: ${result.score}`,
          result.compileOutput ? `Compile output:\n${result.compileOutput.slice(0, 500)}` : "",
        ].filter(Boolean).join("\n");

        expect.soft(result.status, diagnosticMsg).toBe("accepted");
      } catch (e) {
        if (isFlaky) { test.skip(true, String(e).slice(0, 80)); return; }
        expect.soft(false, `${language} error: ${String(e).slice(0, 200)}`).toBe(true);
      }
    });
  }

});
