function isTrustedRegistryImage(image: string, trustedRegistries: string[]) {
  return trustedRegistries.length > 0 && trustedRegistries.some((prefix) => image.startsWith(prefix));
}

function hasValidJudgeImageName(image: string) {
  if (image.includes("..")) return false;
  const pattern = /^[a-zA-Z0-9][a-zA-Z0-9._\-\/:]*$/;
  if (!pattern.test(image) || image.includes("://")) {
    return false;
  }

  const segments = image.split("/");
  const lastSegment = segments[segments.length - 1] ?? "";
  const imageName = lastSegment.split(":")[0] ?? "";
  return imageName.startsWith("judge-");
}

/**
 * Allow only local `judge-*` images or trusted-registry `judge-*` images.
 * This rejects arbitrary Docker Hub images such as `alpine:3.18` and
 * namespace-qualified public images such as `library/alpine:3.18`.
 */
export function isAllowedJudgeDockerImage(
  image: string,
  trustedRegistries = (process.env.TRUSTED_DOCKER_REGISTRIES || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
) {
  if (!hasValidJudgeImageName(image)) {
    return false;
  }
  const segments = image.split("/");
  const firstSegment = segments[0] ?? "";
  const hasRegistryPrefix = segments.length > 1 && (firstSegment.includes(".") || firstSegment === "localhost");

  if (hasRegistryPrefix) {
    return isTrustedRegistryImage(image, trustedRegistries);
  }

  return segments.length === 1;
}

export function isLocalJudgeDockerImage(image: string) {
  if (!hasValidJudgeImageName(image)) {
    return false;
  }

  return image.split("/").length === 1;
}
