export interface LanguageConfig {
  name: string;
  extension: string;
  dockerImage: string;
  compileCommand?: string[];
  runCommand: string[];
}

export const LANGUAGE_CONFIGS: Record<string, LanguageConfig> = {
  c: {
    name: "C",
    extension: ".c",
    dockerImage: "judge-cpp:latest",
    compileCommand: ["gcc", "-O2", "-std=c11", "-o", "/workspace/solution", "/workspace/solution.c", "-lm"],
    runCommand: ["/workspace/solution"],
  },
  cpp: {
    name: "C++",
    extension: ".cpp",
    dockerImage: "judge-cpp:latest",
    compileCommand: ["g++", "-O2", "-std=c++17", "-o", "/workspace/solution", "/workspace/solution.cpp"],
    runCommand: ["/workspace/solution"],
  },
  python: {
    name: "Python",
    extension: ".py",
    dockerImage: "judge-python:latest",
    runCommand: ["python3", "/workspace/solution.py"],
  },
};
