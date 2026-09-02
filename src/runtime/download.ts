export function download(
  filename: string,
  data: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export function requestCode(
  url: string,
  request: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {},
) {
  const options = {
    method: request.method ?? "GET",
    headers: {
      Accept: "application/json",
      ...(request.body ? { "Content-Type": "application/json" } : {}),
      ...request.headers,
    },
    credentials: "omit",
    ...(request.body ? { body: request.body } : {}),
  };
  return `const response = await fetch(${JSON.stringify(url)}, ${JSON.stringify(options, null, 2)});\nif (!response.ok) throw new Error(\`HTTP \${response.status}\`);\nconst data = await response.json();\nconsole.log(data);`;
}
