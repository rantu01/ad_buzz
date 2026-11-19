"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import ArticleEditor from "../ArticleEditor";

export default function NewArticlePage() {
  return <ArticleEditor />;
}
