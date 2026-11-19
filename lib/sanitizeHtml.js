export function sanitizeHtml(html) {
  if (!html) return "";
  let out = String(html);
  // remove script/style/iframe/object/embed
  out = out.replace(/<script[\s\S]*?<\/script>/gi, "");
  out = out.replace(/<style[\s\S]*?<\/style>/gi, "");
  out = out.replace(/<(iframe|object|embed|form|input|button)[^>]*>[\s\S]*?<\/\1>/gi, "");
  out = out.replace(/<(iframe|object|embed|form|input|button)[^>]*\/?>/gi, "");
  // remove event handlers
  out = out.replace(/\son\w+\s*=\s*"[^"]*"/gi, "");
  out = out.replace(/\son\w+\s*=\s*'[^']*'/gi, "");
  out = out.replace(/\son\w+\s*=\s*[^\s>]+/gi, "");
  // remove javascript: urls
  out = out.replace(/href\s*=\s*"\s*javascript:[^"]*"/gi, 'href="#"');
  out = out.replace(/src\s*=\s*"\s*javascript:[^"]*"/gi, 'src=""');
  return out;
}
