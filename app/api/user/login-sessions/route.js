import { NextResponse } from "next/server";
import {
  upsertLoginSession,
  getLoginSessionsByUid,
  deleteLoginSession,
} from "@/lib/loginSessionModel";

function getClientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "Unknown";
}

function normalizeIp(ip) {
  if (!ip) return "Unknown";
  if (ip === "::1" || ip === "::ffff:127.0.0.1") return "127.0.0.1";
  if (ip.startsWith("::ffff:")) return ip.replace("::ffff:", "");
  return ip;
}

function isPrivateIp(ip) {
  if (!ip || ip === "Unknown") return true;
  if (ip === "127.0.0.1" || ip === "localhost") return true;
  if (ip.startsWith("10.") || ip.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return true;
  if (ip.startsWith("::") || ip.includes("fe80")) return true;
  return false;
}

function parseUserAgent(ua = "") {
  let browser = "Unknown";
  let browserVersion = "";
  let os = "Unknown";
  let deviceType = "desktop";
  let deviceName = "Desktop";

  // Browser (order matters: Edge/Opera contain Chrome token)
  let m;
  if ((m = ua.match(/Edg\/([\d.]+)/))) {
    browser = "Edge";
    browserVersion = m[1].split(".")[0];
  } else if ((m = ua.match(/OPR\/([\d.]+)/))) {
    browser = "Opera";
    browserVersion = m[1].split(".")[0];
  } else if ((m = ua.match(/Chrome\/([\d.]+)/))) {
    browser = "Chrome";
    browserVersion = m[1].split(".")[0];
  } else if ((m = ua.match(/Firefox\/([\d.]+)/))) {
    browser = "Firefox";
    browserVersion = m[1].split(".")[0];
  } else if ((m = ua.match(/Version\/([\d.]+).*Safari/))) {
    browser = "Safari";
    browserVersion = m[1].split(".")[0];
  } else if (/Safari\//.test(ua)) {
    browser = "Safari";
  }

  // OS / device
  if (/Windows NT/.test(ua)) {
    os = "Windows";
    deviceName = "Windows";
  } else if (/Mac OS X/.test(ua) && !/iPhone|iPad|iPod/.test(ua)) {
    os = "Mac";
    deviceName = "Mac";
  } else if (/Android/.test(ua)) {
    const v = ua.match(/Android\s([\d.]+)/);
    os = v ? `Android ${v[1]}` : "Android";
    deviceName = "Android";
    deviceType = "mobile";
  } else if (/iPhone/.test(ua)) {
    os = "iOS";
    deviceName = "iPhone";
    deviceType = "mobile";
  } else if (/iPad/.test(ua)) {
    os = "iOS";
    deviceName = "iPad";
    deviceType = "mobile";
  } else if (/Linux/.test(ua)) {
    os = "Linux";
    deviceName = "Linux";
  }

  if (/Mobi|Android|iPhone|iPad|iPod|Mobile/.test(ua)) {
    deviceType = "mobile";
    if (deviceName === "Desktop") deviceName = "Mobile";
  }

  return { browser, browserVersion, os, deviceType, deviceName };
}

async function lookupLocation(ip, headers) {
  // Prefer reverse-proxy / platform geo headers when present.
  try {
    const headerCity = headers.get("x-vercel-ip-city");
    const headerCountry = headers.get("x-vercel-ip-country");
    if (headerCity || headerCountry) {
      return {
        city: headerCity ? decodeURIComponent(headerCity) : "",
        country: headerCountry || "",
      };
    }
  } catch {}

  if (isPrivateIp(ip)) return { city: "", country: "" };

  // Best-effort public IP geolocation; never fail the login log on lookup errors.
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { city: "", country: "" };
    const data = await res.json();
    if (data?.error) return { city: "", country: "" };
    return { city: data?.city || "", country: data?.country_name || data?.country || "" };
  } catch {
    return { city: "", country: "" };
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get("uid");
    if (!uid) {
      return NextResponse.json({ success: false, message: "uid required" }, { status: 400 });
    }
    const sessions = await getLoginSessionsByUid(uid, searchParams.get("limit") || 20);
    return NextResponse.json({ success: true, sessions });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to fetch login sessions" },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { uid, email = "", sessionId, userAgent = "", clientDevice = {} } = body;
    if (!uid || !sessionId) {
      return NextResponse.json(
        { success: false, message: "uid and sessionId are required" },
        { status: 400 }
      );
    }

    const rawUa = userAgent || request.headers.get("user-agent") || "";
    const parsed = parseUserAgent(rawUa);
    const ip = normalizeIp(getClientIp(request));
    const { city, country } = await lookupLocation(ip, request.headers);

    const session = await upsertLoginSession({
      uid,
      email,
      sessionId,
      deviceName: clientDevice.deviceName || parsed.deviceName,
      deviceType: clientDevice.deviceType || parsed.deviceType,
      browser: clientDevice.browser || parsed.browser,
      browserVersion: clientDevice.browserVersion || parsed.browserVersion,
      os: clientDevice.os || parsed.os,
      userAgent: rawUa.slice(0, 500),
      ip,
      city,
      country,
    });

    return NextResponse.json({ success: true, session });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to log login session" },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get("uid");
    const sessionId = searchParams.get("sessionId");
    if (!uid || !sessionId) {
      return NextResponse.json(
        { success: false, message: "uid and sessionId are required" },
        { status: 400 }
      );
    }
    await deleteLoginSession(uid, sessionId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to remove login session" },
      { status: 500 }
    );
  }
}
