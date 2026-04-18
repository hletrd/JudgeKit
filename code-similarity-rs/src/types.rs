use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct ComputeRequest {
    pub submissions: Vec<Submission>,
    #[serde(default = "default_threshold")]
    pub threshold: f64,
    #[serde(default = "default_ngram_size")]
    pub ngram_size: usize,
}

fn default_threshold() -> f64 {
    0.85
}

fn default_ngram_size() -> usize {
    3
}

#[derive(Deserialize, Clone)]
pub struct Submission {
    #[serde(alias = "userId")]
    pub user_id: String,
    #[serde(alias = "problemId")]
    pub problem_id: String,
    pub language: String,
    #[serde(alias = "sourceCode")]
    pub source_code: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct SimilarityPair {
    #[serde(rename = "userId1")]
    pub user_id_1: String,
    #[serde(rename = "userId2")]
    pub user_id_2: String,
    #[serde(rename = "problemId")]
    pub problem_id: String,
    pub language: String,
    pub similarity: f64,
}

#[derive(Serialize)]
pub struct ComputeResponse {
    pub pairs: Vec<SimilarityPair>,
}

#[derive(Serialize)]
pub struct HealthResponse {
    pub ok: bool,
}
