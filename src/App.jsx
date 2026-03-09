import React, { useState, useEffect } from 'react';
import { 
  Wand2, ShieldCheck, GraduationCap, AlignLeft, Loader2, Copy, Check, AlertCircle,
  FileText, Maximize, GitMerge, Scale, Sparkles, Quote, Library, Globe, Upload,
  FileSearch, MessageSquare, PenTool, Network, Search, ChevronRight, Play,
  Github, Twitter, Mail, LayoutDashboard, Settings, Menu, X, ArrowRight, Map, ExternalLink,
  ShieldAlert, RefreshCw, Languages, Book
} from 'lucide-react';

// --- API Helper with Exponential Backoff ---
let apiKey = "";
try {
  apiKey = import.meta.env.VITE_GEMINI_API_KEY; 
} catch (err) {
  apiKey = ""; 
}

const OPENALEX_EMAIL = "abdulrsubin@gmail.com"; // Replace with your email for polite pool

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const fetchWithRetry = async (url, options, retries = 5) => {
  const delays = [1000, 2000, 4000, 8000, 16000];
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        if (response.status === 429) {
            throw new Error("Free tier speed limit reached. Please wait 30 seconds and try again!");
        }
        throw new Error(`API Error: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      if (i === retries - 1) throw error;
      await delay(delays[i]);
    }
  }
};

const processTextWithGemini = async (prompt, textData) => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ role: "user", parts: [{ text: `${prompt}\n\n${textData}` }] }],
    systemInstruction: { parts: [{ text: "คุณคือบรรณาธิการวิชาการผู้เชี่ยวชาญ จัดรูปแบบข้อความให้อ่านง่าย ใช้ **ตัวหนา** สำหรับการเน้นคำหรือหัวข้อย่อย และใช้ * หรือ - สำหรับรายการแบบสัญลักษณ์ (Bullet points) ไม่ต้องใส่คำพูดเกริ่นนำหรือคำลงท้าย" }] }
  };

  const data = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (data && data.candidates && data.candidates.length > 0) {
    return data.candidates[0].content.parts[0].text.trim();
  } else {
    throw new Error("รูปแบบการตอบกลับจาก Gemini API ไม่ถูกต้อง");
  }
};

const formatRichText = (text) => {
  if (!text) return null;
  const blocks = text.split('\n\n');
  return blocks.map((block, index) => {
    if (block.trim().startsWith('- ') || block.trim().startsWith('* ')) {
      const items = block.split('\n').map(item => item.replace(/^[-*]\s/, ''));
      return (
        <ul key={index} className="list-disc list-outside ml-5 mb-4 space-y-2 text-slate-700">
          {items.map((item, i) => (
            <li key={i} dangerouslySetInnerHTML={{ __html: item.replace(/\*\*(.*?)\*\*/g, '<strong class="text-slate-900 font-semibold">$1</strong>') }} />
          ))}
        </ul>
      );
    }
    if (block.startsWith('**') && block.endsWith('**') && !block.includes('\n')) {
      return <h3 key={index} className="text-lg font-bold text-slate-900 mb-3 mt-6 border-b pb-2">{block.replace(/\*\*/g, '')}</h3>;
    }
    const formattedHtml = block.replace(/\*\*(.*?)\*\*/g, '<strong class="text-slate-900 font-semibold">$1</strong>');
    return <p key={index} className="mb-4 text-slate-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: formattedHtml }} />;
  });
};

const reconstructAbstract = (invertedIndex) => {
  if (!invertedIndex) return 'ไม่มีบทคัดย่อ';
  const words = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of positions) {
      words[pos] = word;
    }
  }
  return words.filter(Boolean).join(' ');
};

export default function App() {
  const [currentView, setCurrentView] = useState('home'); 
  const [referenceText, setReferenceText] = useState("");
  const [thesisText, setThesisText] = useState("");
  const [improvedText, setImprovedText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [toast, setToast] = useState(null);
  const [copied, setCopied] = useState(false);
  const [activeMode, setActiveMode] = useState("auto-thesis");
  const [customInstructions, setCustomInstructions] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [thesisType, setThesisType] = useState("phd");

  // Literature Map States
  const [isFetchingArticles, setIsFetchingArticles] = useState(false);
  const [referenceViewMode, setReferenceViewMode] = useState('text'); 
  const [articlesData, setArticlesData] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [topicSearch, setTopicSearch] = useState(""); 
  const [dataSource, setDataSource] = useState('openalex'); // 'openalex', 'semanticscholar', 'mhesi'

  const showToast = (message, type = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
    script.async = true;
    document.body.appendChild(script);
    script.onload = () => {
      if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
    };
    return () => { if (document.body.contains(script)) document.body.removeChild(script); };
  }, []);

  const modes = [
    { id: "auto-thesis", name: "เขียนวิทยานิพนธ์อัตโนมัติ", icon: <Book className="w-4 h-4 text-orange-500" />, desc: "สร้างโครงร่างและเนื้อหาวิทยานิพนธ์ฉบับเต็มจากหัวข้อ (ภาษาไทย)" },
    { id: "esl-action-research", name: "วิจัยในชั้นเรียน (Action Research)", icon: <FileSearch className="w-4 h-4 text-teal-500" />, desc: "เปลี่ยนปัญหาในห้องเรียนให้เป็นงานวิจัยฉบับเต็ม" },
    { id: "write-beautifully", name: "ปรับสำนวนให้สละสลวย", icon: <Sparkles className="w-4 h-4 text-purple-400" />, desc: "ให้ AI ช่วยเรียบเรียงข้อความให้สละสลวยน่าอ่าน" },
    { id: "academic", name: "ปรับเป็นภาษาทางการ/วิชาการ", icon: <GraduationCap className="w-4 h-4" />, desc: "ยกระดับคำศัพท์ให้เป็นภาษาไทยระดับวิชาการที่เข้มงวด" },
    { id: "plagiarism-check", name: "ตรวจสอบการคัดลอกซ้ำ (Plagiarism)", icon: <ShieldAlert className="w-4 h-4" />, desc: "ตรวจสอบข้อความที่อาจเป็นการคัดลอก และการอ้างอิงที่หายไป" },
    { id: "paraphrase", name: "เรียบเรียงใหม่ (Paraphrase)", icon: <ShieldCheck className="w-4 h-4" />, desc: "ปรับโครงสร้างประโยคเพื่อหลีกเลี่ยงการคัดลอก (Plagiarism)" },
    { id: "deep-paraphrase", name: "เรียบเรียงใหม่ขั้นสูง", icon: <RefreshCw className="w-4 h-4 text-indigo-400" />, desc: "เขียนใหม่ทั้งหมดโดยยังคงความหมายเดิม 100%" },
    { id: "gap-analysis", name: "วิเคราะห์ช่องว่างการวิจัย", icon: <Network className="w-4 h-4" />, desc: "หาช่องว่างจากงานวิจัยที่เกี่ยวข้อง (Research Gap)" },
    { id: "synthesize", name: "สังเคราะห์วรรณกรรม", icon: <GitMerge className="w-4 h-4" />, desc: "รวมหลายๆ ย่อหน้าหรือไอเดียให้เป็นเนื้อเดียวกัน" },
    { id: "expand", name: "ขยายความ", icon: <Maximize className="w-4 h-4" />, desc: "เปลี่ยนหัวข้อย่อให้เป็นย่อหน้าที่สมบูรณ์" },
    { id: "grammar", name: "แก้ไขตัวสะกดและไวยากรณ์", icon: <Wand2 className="w-4 h-4" />, desc: "ตรวจคำผิด การเว้นวรรค และเครื่องหมายวรรคตอน" },
    { id: "counter", name: "หาข้อโต้แย้ง / จุดอ่อน", icon: <Scale className="w-4 h-4" />, desc: "วิเคราะห์หาจุดอ่อน หรือสร้างข้อโต้แย้งเชิงวิชาการ" },
    { id: "apa-citation", name: "สร้างอ้างอิง APA 7th", icon: <Quote className="w-4 h-4" />, desc: "จัดรูปแบบข้อมูลดิบให้เป็นการอ้างอิง APA ที่ถูกต้อง" },
  ];

  const fullPrompts = {
    "auto-thesis": "สวมบทบาทเป็นศาสตราจารย์และผู้เชี่ยวชาญด้านการเขียนวิทยานิพนธ์ จากหัวข้อ โครงร่าง หรือบันทึกย่อที่กำหนดให้ใน 'แบบร่างปัจจุบัน (Draft)' โปรดเขียนแบบร่างวิทยานิพนธ์ที่สมบูรณ์ เป็นภาษาไทยระดับวิชาการ (Academic Thai Language) โดยประกอบด้วย บทนำ, การทบทวนวรรณกรรม, ระเบียบวิธีวิจัย และบทสรุป ผลลัพธ์ต้องมีความละเอียดสูง มีโครงสร้างที่ชัดเจน เป็นทางการ และใช้คำศัพท์เชิงวิชาการที่เหมาะสม เพื่อเป็นรากฐานสำหรับวิทยานิพนธ์ระดับสูง คุณต้องหลีกเลี่ยงการคัดลอกผลงานโดยการเรียบเรียงความคิดใหม่และสังเคราะห์ข้อโต้แย้งที่เป็นต้นฉบับ คุณต้องใส่การอ้างอิงในเนื้อหาให้ถูกต้อง (เช่น รูปแบบ APA ฉบับที่ 7) โดยดึงข้อมูลจาก 'เอกสารอ้างอิง (Reference)' หากมี หรือใช้ข้อมูลสมมติที่สมจริงหากไม่มี สุดท้ายให้เพิ่มหัวข้อ 'เอกสารอ้างอิง' ที่จัดรูปแบบอย่างสมบูรณ์ในตอนท้ายสุด",
    "esl-action-research": "สวมบทบาทเป็นนักวิจัยทางการศึกษา จากปัญหาในห้องเรียนที่ระบุไว้ใน 'แบบร่างปัจจุบัน' (และข้อมูลจาก 'เอกสารอ้างอิง' หากมี) โปรดเขียนรายงานการวิจัยในชั้นเรียน (Action Research) ฉบับสมบูรณ์ เป็นภาษาไทยระดับวิชาการ โดยให้ครอบคลุมถึง บทนำ (บริบท, ปัญหา, คำถามการวิจัย), การทบทวนวรรณกรรม, แผนการดำเนินการ/วิธีวิจัย, การเก็บรวบรวมและการวิเคราะห์ข้อมูล และผลที่คาดว่าจะได้รับ/บทสรุป ประยุกต์ใช้กลยุทธ์การสอนที่ปฏิบัติได้จริงร่วมกับความเข้มงวดทางวิชาการ ใส่การอ้างอิง APA 7th และเพิ่มส่วน 'เอกสารอ้างอิง' ท้ายเอกสาร",
    "write-beautifully": "สวมบทบาทเป็นนักวิชาการระดับแนวหน้า นำ 'แบบร่างปัจจุบัน' (และ 'เอกสารอ้างอิง' หากมี) มาเขียนเรียบเรียงใหม่ให้มีความสละสลวย ขยายความคิดอย่างลื่นไหล สร้างการเล่าเรื่องที่มีตรรกะและน่าติดตาม ใช้คำศัพท์ทางวิชาการภาษาไทยที่สละสลวยและซับซ้อน และตรวจสอบให้แน่ใจว่าข้อความที่ได้นั้นมีโครงสร้างที่สมบูรณ์แบบสำหรับวิทยานิพนธ์ระดับสูง",
    "academic": "เขียนข้อความที่ให้มาใหม่ โดยปรับใช้โทนเสียงทางวิชาการและเป็นทางการขั้นสูง (Academic Tone) เป็นภาษาไทยที่เหมาะสมสำหรับวิทยานิพนธ์ระดับปริญญาโทหรือปริญญาเอก หลีกเลี่ยงภาษาพูดและคำศัพท์ที่ไม่เป็นทางการ",
    "plagiarism-check": "ทำหน้าที่เป็นเครื่องมือตรวจสอบการคัดลอกผลงานวิชาการขั้นสูง วิเคราะห์ 'แบบร่างปัจจุบัน' เพื่อหาความเป็นไปได้ของการคัดลอกผลงาน (Plagiarism) สำนวนที่ใช้บ่อยเกินไป และการอ้างอิงที่หายไป หากมีการให้ 'เอกสารอ้างอิง' มาด้วย ให้ตรวจสอบว่าแบบร่างมีความทับซ้อนกับเอกสารอ้างอิงมากเกินไปโดยไม่มีการยกมาอ้างอิงอย่างถูกต้องหรือไม่ โปรดประเมิน **คะแนนความเป็นต้นฉบับ (0-100%)**, ระบุ **ประโยคที่มีความเสี่ยงสูง** และให้คำแนะนำที่สามารถนำไปปฏิบัติได้เพื่อแก้ไข สร้างรายงานเป็นภาษาไทย",
    "gap-analysis": "ทำการวิเคราะห์ช่องว่างของการวิจัย (Literature Gap Analysis) โดยใช้ 'เอกสารอ้างอิง' เพื่อจัดกลุ่มหัวข้อและระบุ RESEARCH GAPS อย่างชัดเจน จากนั้นใช้ 'แบบร่างปัจจุบัน' เพื่อระบุว่าวิทยานิพนธ์นี้เข้ามาเติมเต็มช่องว่างนี้ได้อย่างไร สร้างรายงานการวิเคราะห์เป็นภาษาไทย",
    "paraphrase": "เรียบเรียงและปรับโครงสร้างข้อความใหม่ (Paraphrase) อย่างมีนัยสำคัญเพื่อให้ผ่านการตรวจสอบการคัดลอกผลงาน ในขณะที่ยังคงความหมายทางวิชาการเดิมไว้ครบถ้วน เขียนเป็นภาษาไทย",
    "deep-paraphrase": "ทำการเรียบเรียงใหม่ขั้นสูง (Aggressive Deep Paraphrase) เป้าหมายคือให้มีความเป็นต้นฉบับ 99% เพื่อเลี่ยงเครื่องมือตรวจจับการคัดลอก ปรับโครงสร้างย่อหน้าใหม่ทั้งหมด เปลี่ยนโครงสร้างประโยค และใช้คำพ้องความหมายเชิงวิชาการขั้นสูง คุณต้องรักษาความหมายทางวิชาการ ข้อเท็จจริง ข้อมูล และการอ้างอิงดั้งเดิมไว้ทั้งหมด เขียนเป็นภาษาไทยระดับวิชาการ",
    "synthesize": "สังเคราะห์บันทึกย่อ/คำพูดที่ให้มาให้เป็นย่อหน้าทบทวนวรรณกรรมเชิงวิชาการที่มีความเชื่อมโยงและมีโครงสร้างที่ดีเยี่ยม เขียนเป็นภาษาไทย",
    "expand": "นำประเด็นสั้นๆ ที่ให้มาไปขยายความเป็นย่อหน้าเชิงวิชาการที่ได้รับการพัฒนาอย่างสมบูรณ์และมีข้อมูลสนับสนุน เขียนเป็นภาษาไทยระดับวิชาการ",
    "grammar": "แก้ไขข้อผิดพลาดทางไวยากรณ์ การสะกดคำ การเว้นวรรคตอนให้ถูกต้องทั้งหมด โดยคงสไตล์การเขียนดั้งเดิมไว้ (สำหรับภาษาไทย ให้เน้นที่การใช้คำศัพท์ที่ถูกต้องและการเรียงประโยค)",
    "counter": "วิเคราะห์ข้อความอย่างมีวิจารณญาณ สร้างข้อโต้แย้งเชิงวิชาการที่แข็งแกร่งหรือระบุข้อจำกัดของแนวคิดในข้อความอย่างชัดเจน เขียนเป็นภาษาไทย",
    "apa-citation": "วิเคราะห์ข้อมูลแหล่งที่มาดิบ จัดรูปแบบให้เป็นการอ้างอิงรูปแบบ APA ฉบับที่ 7 ที่สมบูรณ์แบบ (ทั้งแบบอ้างอิงในเนื้อหาและบรรณานุกรมท้ายเล่ม)"
  };

  const thesisTypesConfig = {
    "phd": { name: "วิทยานิพนธ์ระดับปริญญาเอก (PhD Thesis)", words: "30,000 ถึง 80,000 คำ" },
    "master": { name: "วิทยานิพนธ์ระดับปริญญาโท (Master Thesis)", words: "20,000 ถึง 40,000 คำ" },
    "bachelor": { name: "ปริญญานิพนธ์ระดับปริญญาตรี (Bachelor Dissertation)", words: "15,000 ถึง 30,000 คำ" },
    "paper": { name: "บทความวิจัย (Academic Paper)", words: "5,000 ถึง 15,000 คำ" },
    "legal": { name: "งานวิจัยทางกฎหมาย (Legal Research)", words: "15,000 ถึง 40,000 คำ" }
  };

  const handleProcess = async () => {
    if (!referenceText.trim() && !thesisText.trim()) {
      showToast("กรุณาใส่ข้อความในช่องเอกสารอ้างอิง หรือ แบบร่าง", "error");
      return;
    }
    setIsProcessing(true);
    setImprovedText("");

    let finalPrompt = fullPrompts[activeMode];
    if (customInstructions.trim()) finalPrompt += `\n\nคำสั่งเพิ่มเติมจากผู้ใช้ (CUSTOM INSTRUCTION): ${customInstructions.trim()}`;

    if (activeMode === 'auto-thesis') {
      const tType = thesisTypesConfig[thesisType];
      finalPrompt += `\n\nประเภทของเอกสารเป้าหมาย: ${tType.name}.\nความยาวที่คาดหวัง: ${tType.words}.\nโปรดปรับความลึกซึ้ง ความเข้มงวดทางวิชาการ ความซับซ้อนของโครงสร้าง และขอบเขตการเขียนให้ตรงกับมาตรฐานของ ${tType.name} ในความยาวระดับนี้ สร้างเนื้อหาให้ละเอียดและครอบคลุมที่สุดเท่าที่จะเป็นไปได้ ตอบเป็นภาษาไทย`;
    }

    let contentText = "";
    if (referenceText.trim() && thesisText.trim()) {
        finalPrompt += "\n\nบริบท (CONTEXT): ใช้ 'เอกสารอ้างอิง' เพื่อปรับปรุงหรือสนับสนุน 'แบบร่างปัจจุบัน'";
        contentText = `--- เอกสารอ้างอิง (REFERENCE MATERIAL) ---\n${referenceText}\n\n--- แบบร่างปัจจุบัน (THESIS DRAFT) ---\n${thesisText}`;
    } else if (referenceText.trim()) {
        contentText = `--- ข้อความต้นฉบับ ---\n${referenceText}`;
    } else {
        contentText = `--- ข้อความต้นฉบับ ---\n${thesisText}`;
    }

    try {
      const result = await processTextWithGemini(finalPrompt, contentText);
      setImprovedText(result);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePlagiarismScan = async () => {
    if (!thesisText.trim()) {
      showToast("กรุณาวางแบบร่างของคุณก่อนเพื่อตรวจสอบการคัดลอก (Plagiarism Scan)", "error");
      return;
    }
    setActiveMode("plagiarism-check");
    setIsProcessing(true);
    setImprovedText("");

    const prompt = fullPrompts["plagiarism-check"];
    const contentText = `--- แบบร่างที่ต้องการตรวจสอบ (DRAFT) ---\n${thesisText}\n\n--- เอกสารอ้างอิง / ต้นฉบับ (หากมี) ---\n${referenceText}`;

    try {
      const result = await processTextWithGemini(prompt, contentText);
      setImprovedText(result);
      showToast("ตรวจสอบ Plagiarism เสร็จสมบูรณ์!", "success");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopy = () => {
    if (!improvedText) return;
    navigator.clipboard.writeText(improvedText).then(() => {
      setCopied(true);
      showToast("คัดลอกไปยังคลิปบอร์ดแล้ว!", "success");
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => showToast("ไม่สามารถคัดลอกได้", "error"));
  };

  const extractTextFromPDF = async (file) => {
    if (!window.pdfjsLib) {
      showToast("กำลังโหลดตัวอ่าน PDF กรุณารอสักครู่แล้วลองอีกครั้ง", "error");
      return;
    }
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map(item => item.str).join(' ') + '\n\n';
      }
      setReferenceText(fullText.trim());
      setReferenceViewMode('text');
      showToast("ดึงข้อความจาก PDF สำเร็จ", "success");
    } catch (err) {
      showToast("ไม่สามารถดึงข้อความจาก PDF ได้ อาจเป็นไฟล์ภาพสแกน", "error");
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.type === 'application/pdf') {
      setIsProcessing(true);
      await extractTextFromPDF(file);
      setIsProcessing(false);
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        setReferenceText(event.target.result);
        setReferenceViewMode('text');
      };
      reader.readAsText(file);
    }
    e.target.value = null;
  };

  // --- API Fetchers ---
  const fetchFromOpenAlex = async (keywords) => {
    const baseUrl = 'https://api.openalex.org/works';
    const params = {
      'mailto': OPENALEX_EMAIL,
      'search': keywords,
      'filter': 'type:article',
      'per-page': 15,
      'select': 'id,title,authorships,publication_year,cited_by_count,primary_location,abstract_inverted_index,doi'
    };
    const url = new URL(baseUrl);
    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
    const response = await fetch(url);
    if (!response.ok) throw new Error(`OpenAlex error: ${response.status}`);
    const data = await response.json();
    return data.results;
  };

  const fetchFromSemanticScholar = async (keywords) => {
    const baseUrl = 'https://api.semanticscholar.org/graph/v1/paper/search';
    const params = {
      query: keywords,
      limit: 20,
      fields: 'title,authors,abstract,year,citationCount,url,paperId'
    };
    const url = new URL(baseUrl);
    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Semantic Scholar error: ${response.status}`);
    const data = await response.json();
    return data.data;
  };

  const fetchFromMHESI = async (keywords) => {
    // MHESI CKAN open data API
    const url = `https://data.mhesi.go.th/api/3/action/package_search?q=${encodeURIComponent(keywords)}&rows=15`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`MHESI API error: ${response.status}`);
    const data = await response.json();
    if (data.success && data.result) {
      return data.result.results;
    }
    return [];
  };

  const fetchFromThaiJO = async (keywords) => {
    const response = await fetch('http://localhost:3001/api/thaijo/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        term: keywords,
        page: 1,
        size: 20,
        strict: true,
        title: true,
        author: true,
        abstract: true
      })
    });
    if (!response.ok) throw new Error(`ThaiJO API error: ${response.status}`);
    const data = await response.json();
    
    // Transform the data for your literature map
    return (data.result || []).map(article => ({
      id: article.id || Math.random().toString(),
      title: article.title?.th_TH || article.title?.en_US || 'ไม่ระบุชื่อเรื่อง',
      author: article.authors?.[0]?.full_name?.th_TH || article.authors?.[0]?.full_name?.en_US || 'ไม่ระบุ',
      year: article.datePublished ? new Date(article.datePublished).getFullYear() : new Date().getFullYear(),
      citations: Math.floor(Math.random() * 4), // Added slight random offset so map nodes don't entirely overlap at 0
      url: article.articleUrl || '',
      abstract: article.abstract_clean?.th_TH || article.abstract_clean?.en_US || 'ไม่มีบทคัดย่อ',
      journal: article.thaijoUrl || '',
      doi: article.pubIdDoi || ''
    }));
  };

  const handleFetchOnlineArticles = async () => {
    if (!thesisText.trim()) {
      showToast("กรุณาวางแบบร่างก่อน เพื่อให้ระบบวิเคราะห์หาคำค้นหา (Keywords) อัตโนมัติ", "error");
      return;
    }
    setIsFetchingArticles(true);
    try {
      const keywords = await processTextWithGemini("Extract 3 to 4 highly specific academic search keywords from this text that perfectly capture the main research topic. Return ONLY the keywords separated by spaces. If the text is in Thai, provide keywords in Thai.", thesisText);
      await performLiteratureSearch(keywords);
      setTopicSearch(keywords);
    } catch (err) {
      showToast("เกิดข้อผิดพลาดในการค้นหาเอกสาร: " + err.message, "error");
      setIsFetchingArticles(false);
    }
  };

  const handleManualSearch = async (e) => {
    if (e) e.preventDefault();
    if (!topicSearch.trim()) {
      showToast("กรุณาระบุหัวข้อหรือคำค้นหา (Keyword)", "error");
      return;
    }
    setIsFetchingArticles(true);
    await performLiteratureSearch(topicSearch);
  };

  const performLiteratureSearch = async (queryKeywords) => {
    try {
      let parsedArticles = [];
      
      if (dataSource === 'openalex') {
        const results = await fetchFromOpenAlex(queryKeywords);
        parsedArticles = results.map(paper => {
          return {
            id: paper.id || Math.random().toString(),
            title: paper.title || 'ไม่ระบุชื่อเรื่อง',
            author: paper.authorships?.[0]?.author?.display_name || 'ไม่ระบุชื่อผู้แต่ง',
            year: paper.publication_year || new Date().getFullYear(),
            citations: paper.cited_by_count || 0,
            url: paper.primary_location?.landing_page_url || (paper.doi ? `https://doi.org/${paper.doi}` : paper.id),
            abstract: reconstructAbstract(paper.abstract_inverted_index)
          };
        }).filter(a => a.title !== 'ไม่ระบุชื่อเรื่อง');

      } else if (dataSource === 'semanticscholar') {
        const results = await fetchFromSemanticScholar(queryKeywords);
        parsedArticles = results.map(paper => ({
          id: paper.paperId,
          title: paper.title || 'ไม่ระบุชื่อเรื่อง',
          author: paper.authors?.[0]?.name || 'ไม่ระบุชื่อผู้แต่ง',
          year: paper.year || new Date().getFullYear(),
          citations: paper.citationCount || 0,
          url: paper.url || `https://www.semanticscholar.org/paper/${paper.paperId}`,
          abstract: paper.abstract || 'ไม่มีบทคัดย่อ',
        }));

      } else if (dataSource === 'mhesi') {
        const results = await fetchFromMHESI(queryKeywords);
        parsedArticles = results.map(pkg => ({
          id: pkg.id,
          title: pkg.title || pkg.name || 'ไม่ระบุชื่อเรื่อง',
          author: pkg.author || pkg.maintainer || 'ไม่ระบุชื่อองค์กร/ผู้แต่ง',
          year: pkg.metadata_created ? new Date(pkg.metadata_created).getFullYear() : new Date().getFullYear(),
          citations: Math.floor(Math.random() * 5), // CKAN typically lacks citations, mock for visualization
          url: pkg.url || `https://data.mhesi.go.th/dataset/${pkg.name}`,
          abstract: pkg.notes || 'ไม่มีรายละเอียดเพิ่มเติม'
        }));
      } else if (dataSource === 'thaijo') {
        parsedArticles = await fetchFromThaiJO(queryKeywords);
      }

      if (parsedArticles && parsedArticles.length > 0) {
        setArticlesData(parsedArticles);
        setReferenceViewMode('map');
        setSelectedNode(null);
        showToast(`พบเอกสาร ${parsedArticles.length} รายการจาก ${dataSource}!`, "success");
      } else {
        showToast("ไม่พบเอกสารสำหรับหัวข้อนี้ ลองเปลี่ยนคำค้นหาใหม่", "error");
      }
    } catch (err) {
      showToast("การดึงข้อมูลล้มเหลว (หากใช้ MHESI อาจติดข้อจำกัด CORS ในเบราว์เซอร์ ลองใช้ OpenAlex) - " + err.message, "error");
    } finally {
      setIsFetchingArticles(false);
    }
  };

  const renderLiteratureMap = () => {
    if (articlesData.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-6 text-center bg-slate-50/50 relative">
                <div className="w-full max-w-md mb-8">
                    <form onSubmit={handleManualSearch} className="flex items-center bg-white border border-slate-200 shadow-sm rounded-full px-4 py-2 focus-within:ring-2 ring-indigo-500/20 transition-all">
                        <Search className="w-5 h-5 text-slate-400 mr-2" />
                        <input
                            type="text"
                            value={topicSearch}
                            onChange={(e) => setTopicSearch(e.target.value)}
                            placeholder="ระบุหัวข้อวิทยานิพนธ์ของคุณ (เช่น เศรษฐกิจพอเพียง, AI)..."
                            className="flex-1 bg-transparent border-none text-sm focus:outline-none text-slate-700 font-medium"
                        />
                        <button type="submit" disabled={isFetchingArticles} className="ml-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white px-4 py-1.5 rounded-full text-xs font-semibold transition-colors flex items-center">
                            {isFetchingArticles ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "ค้นหา"}
                        </button>
                    </form>
                </div>
                
                <Network className="w-12 h-12 mb-3 text-slate-300" />
                <p className="text-sm font-medium mb-1">ค้นหาหัวข้อเพื่อสร้างแผนที่วรรณกรรม (Literature Map)</p>
                <p className="text-xs">หรือคลิกที่ไอคอน 🌐 ด้านบนเพื่อดึงคำสำคัญ (Keyword) จากแบบร่างอัตโนมัติ</p>
            </div>
        )
    }

    const minYear = Math.min(...articlesData.map(a => a.year));
    const maxYear = Math.max(...articlesData.map(a => a.year));
    const minCites = Math.min(...articlesData.map(a => a.citations));
    const maxCites = Math.max(...articlesData.map(a => a.citations));
    
    let xRange = maxYear - minYear;
    if (xRange === 0) xRange = 1; 
    
    let yRange = maxCites - minCites;
    if (yRange === 0) yRange = 1;

    return (
        <div className="flex-1 relative bg-white overflow-hidden" onClick={() => setSelectedNode(null)}>
            <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] opacity-50 pointer-events-none"></div>
            
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 w-[90%] max-w-sm">
                <form onSubmit={handleManualSearch} className="flex items-center bg-white/95 backdrop-blur-md border border-slate-200 shadow-lg rounded-full px-4 py-2 focus-within:ring-2 ring-indigo-500/20">
                    <Search className="w-4 h-4 text-slate-400 mr-2" />
                    <input
                        type="text"
                        value={topicSearch}
                        onChange={(e) => setTopicSearch(e.target.value)}
                        placeholder="ค้นหาหัวข้อใหม่..."
                        className="flex-1 bg-transparent border-none text-sm focus:outline-none text-slate-700 placeholder:text-slate-400"
                    />
                    <button type="submit" disabled={isFetchingArticles} className="ml-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white rounded-full p-1.5 transition-colors">
                        {isFetchingArticles ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                    </button>
                </form>
            </div>

            <div className="absolute left-6 top-6 bottom-12 border-l border-slate-200/80 pointer-events-none" />
            <div className="absolute left-6 bottom-12 right-6 border-b border-slate-200/80 pointer-events-none" />
            
            <span className="absolute left-10 bottom-6 text-[10px] text-slate-400 font-semibold tracking-widest uppercase pointer-events-none">
                ตีพิมพ์ล่าสุด &rarr;
            </span>
            <span className="absolute left-1 top-10 text-[10px] text-slate-400 font-semibold tracking-widest uppercase -rotate-90 origin-left pointer-events-none w-32">
                การอ้างอิงมาก &rarr;
            </span>

            {articlesData.map((article, i) => {
                const x = ((article.year - minYear) / xRange) * 70 + 15;
                const y = 85 - (((article.citations - minCites) / yRange) * 70);
                const isSelected = selectedNode?.id === article.id;

                return (
                    <div 
                        key={i} 
                        className={`absolute flex flex-col items-center cursor-pointer group transform -translate-x-1/2 -translate-y-1/2 transition-all duration-300 z-10 hover:scale-110 ${isSelected ? 'z-20 scale-110' : ''}`} 
                        style={{ left: `${x}%`, top: `${y}%` }} 
                        onClick={(e) => { e.stopPropagation(); setSelectedNode(article); }}
                    >
                        <div className={`w-5 h-5 rounded-full border-2 shadow-sm transition-colors ${
                            isSelected 
                                ? 'border-indigo-600 bg-indigo-100 ring-4 ring-indigo-50' 
                                : 'border-slate-800 bg-white group-hover:border-indigo-500'
                        }`} />
                        
                        <div className={`mt-1.5 flex flex-col items-center text-center transition-opacity ${isSelected ? 'opacity-100' : 'opacity-70 group-hover:opacity-100'}`}>
                            <span className={`text-[10px] font-bold leading-none ${isSelected ? 'text-indigo-700' : 'text-slate-700'}`}>{article.author}</span>
                            <span className="text-[9px] text-slate-400 mt-0.5">{article.year}</span>
                        </div>
                    </div>
                )
            })}

            {selectedNode && (
                <div 
                    className="absolute top-16 right-4 w-64 bg-white/95 backdrop-blur-md border border-slate-200 shadow-2xl rounded-xl p-4 z-30 flex flex-col animate-in fade-in zoom-in-95 duration-200"
                    onClick={(e) => e.stopPropagation()}
                >
                    <button onClick={() => setSelectedNode(null)} className="absolute top-3 right-3 text-slate-400 hover:text-slate-800 transition-colors">
                        <X className="w-4 h-4"/>
                    </button>
                    
                    <div className="pr-6">
                       <h4 className="text-sm font-bold text-slate-900 mb-1 leading-tight line-clamp-3">{selectedNode.title}</h4>
                       <p className="text-xs font-medium text-indigo-600 mb-2">{selectedNode.author} ({selectedNode.year}) &bull; {selectedNode.citations} การอ้างอิง</p>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto custom-scrollbar max-h-32 mb-4 bg-slate-50 p-2 rounded border border-slate-100">
                        <p className="text-xs text-slate-600 leading-relaxed italic">{selectedNode.abstract}</p>
                    </div>
                    
                    <div className="flex space-x-2 mt-auto">
                        <button 
                            onClick={() => {
                                const newRef = `[เพิ่มจาก Map]\nชื่อเรื่อง: ${selectedNode.title}\nผู้แต่ง: ${selectedNode.author} (${selectedNode.year})\nบทคัดย่อ: ${selectedNode.abstract}\n\n`;
                                setReferenceText(prev => prev.trim() ? prev + '\n\n' + newRef : newRef);
                                showToast("เพิ่มลงในเอกสารอ้างอิงแล้ว", "success");
                            }} 
                            className="flex-1 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg text-xs font-semibold transition-colors shadow-sm flex justify-center items-center"
                        >
                            <FileText className="w-3.5 h-3.5 mr-1.5" /> ดึงเนื้อหา
                        </button>
                        {selectedNode.url && (
                            <a 
                                href={selectedNode.url} target="_blank" rel="noopener noreferrer"
                                className="py-2 px-3 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg transition-colors flex justify-center items-center"
                                title="เปิดต้นฉบับ"
                            >
                                <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
  };

  if (currentView === 'home') {
    return (
      <div className="min-h-screen bg-slate-50 font-sans selection:bg-indigo-200">
        <header className="absolute top-0 w-full z-50">
          <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                <BookOpenIcon className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-xl tracking-tight text-slate-900">ผู้ช่วยเขียนวิทยานิพนธ์</span>
            </div>
            <button onClick={() => setCurrentView('app')} className="bg-slate-900 hover:bg-slate-800 text-white px-6 py-2.5 rounded-full text-sm font-medium transition-all shadow-lg hover:shadow-xl flex items-center">
              เปิดพื้นที่ทำงาน <ArrowRight className="w-4 h-4 ml-2" />
            </button>
          </div>
        </header>

        <main>
          <section className="pt-32 pb-20 px-6 relative overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-[500px] opacity-30 pointer-events-none">
              <div className="absolute top-20 left-10 w-72 h-72 bg-purple-400 rounded-full mix-blend-multiply filter blur-3xl animate-blob"></div>
              <div className="absolute top-20 right-10 w-72 h-72 bg-indigo-400 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-2000"></div>
              <div className="absolute -bottom-8 left-40 w-72 h-72 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-4000"></div>
            </div>

            <div className="max-w-4xl mx-auto text-center relative z-10">
              <div className="inline-flex items-center space-x-2 bg-white/60 backdrop-blur-md border border-slate-200/50 px-4 py-2 rounded-full text-indigo-700 font-semibold text-xs mb-8 shadow-sm">
                <Sparkles className="w-4 h-4 text-indigo-500" />
                <span>ขับเคลื่อนโดยอัจฉริยภาพของ Gemini AI</span>
              </div>
              <h1 className="text-5xl md:text-7xl font-extrabold text-slate-900 tracking-tight mb-8 leading-tight">
                วิทยานิพนธ์ของคุณ, <br className="hidden md:block"/>
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">เขียนอย่างสมบูรณ์แบบ</span>
              </h1>
              <p className="text-xl text-slate-600 mb-10 max-w-2xl mx-auto leading-relaxed">
                พื้นที่ทำงานระดับพรีเมียมสำหรับนักวิชาการไทย ค้นหางานวิจัย (ThaiJO, MHESI), ตรวจสอบการคัดลอก และสังเคราะห์ข้อมูลได้เร็วกว่า 10 เท่า ด้วยพลัง AI
              </p>
              <button onClick={() => setCurrentView('app')} className="px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full font-semibold text-lg transition-all shadow-xl hover:shadow-indigo-500/30 hover:-translate-y-0.5 flex items-center mx-auto">
                เข้าสู่พื้นที่ทำงาน
              </button>
            </div>
          </section>

          <section className="px-6 pb-24">
            <div className="max-w-6xl mx-auto bg-white rounded-2xl shadow-2xl border border-slate-200/60 overflow-hidden transform -rotate-1 hover:rotate-0 transition-transform duration-500">
              <div className="h-12 bg-slate-100/80 border-b border-slate-200 flex items-center px-4 space-x-2">
                <div className="w-3 h-3 rounded-full bg-rose-400"></div>
                <div className="w-3 h-3 rounded-full bg-amber-400"></div>
                <div className="w-3 h-3 rounded-full bg-emerald-400"></div>
              </div>
              <div className="flex h-[500px] bg-slate-50">
                <div className="w-64 border-r border-slate-200 bg-white p-4 hidden md:block">
                  <div className="h-8 bg-slate-100 rounded mb-4"></div>
                  <div className="h-8 bg-slate-100 rounded mb-4"></div>
                  <div className="h-8 bg-indigo-50 rounded mb-4 border border-indigo-100"></div>
                </div>
                <div className="flex-1 p-6 flex gap-6">
                  <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 p-4"><div className="w-1/3 h-4 bg-slate-200 rounded mb-4"></div><div className="w-full h-2 bg-slate-100 rounded mb-2"></div><div className="w-4/5 h-2 bg-slate-100 rounded"></div></div>
                  <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 p-4"><div className="w-1/3 h-4 bg-slate-200 rounded mb-4"></div><div className="w-full h-2 bg-slate-100 rounded mb-2"></div><div className="w-5/6 h-2 bg-slate-100 rounded"></div></div>
                </div>
              </div>
            </div>
          </section>
        </main>

        <footer className="bg-slate-900 border-t border-slate-800 py-16 px-6 mt-auto">
          <div className="max-w-7xl mx-auto grid md:grid-cols-4 gap-8">
             <div className="col-span-2">
               <div className="flex items-center space-x-2 text-white mb-4">
                  <BookOpenIcon className="w-6 h-6 text-indigo-400" />
                  <span className="font-bold text-xl">ผู้ช่วยเขียนวิทยานิพนธ์</span>
               </div>
               <p className="mb-6 max-w-sm text-slate-400 leading-relaxed">สร้างมาเพื่อช่วยให้นักศึกษาปริญญาโท ปริญญาเอก และนักวิชาการไทย จัดโครงสร้าง สังเคราะห์ และขัดเกลาเนื้อหางานวิจัยได้อย่างง่ายดาย</p>
               <div>
                 <a href="mailto:abdulrsubin@gmail.com" className="inline-flex items-center space-x-2 text-slate-300 hover:text-white transition-colors">
                   <Mail className="w-5 h-5 text-indigo-400" />
                   <span>abdulrsubin@gmail.com</span>
                 </a>
               </div>
             </div>
             <div>
               <h4 className="text-white font-bold mb-4">สินค้า</h4>
               <ul className="space-y-3 text-sm text-slate-400">
                 <li><button onClick={() => setCurrentView('app')} className="hover:text-white transition-colors">เปิดพื้นที่ทำงาน (App)</button></li>
                 <li><a href="#" className="hover:text-white transition-colors">คุณสมบัติ</a></li>
                 <li><a href="#" className="hover:text-white transition-colors">ราคา (ใช้ฟรี)</a></li>
               </ul>
             </div>
             <div>
               <h4 className="text-white font-bold mb-4">นโยบายและกฎหมาย</h4>
               <ul className="space-y-3 text-sm text-slate-400">
                 <li><a href="#" className="hover:text-white transition-colors">นโยบายความเป็นส่วนตัว</a></li>
                 <li><a href="#" className="hover:text-white transition-colors">ข้อกำหนดการให้บริการ</a></li>
                 <li><a href="#" className="hover:text-white transition-colors">จริยธรรมทางวิชาการ</a></li>
               </ul>
             </div>
          </div>
          <div className="max-w-7xl mx-auto mt-12 pt-8 border-t border-slate-800 text-sm text-slate-500">
            &copy; {new Date().getFullYear()} ผู้ช่วยเขียนวิทยานิพนธ์. All rights reserved.
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 font-sans overflow-hidden">
      
      {toast && (
        <div className={`absolute top-6 left-1/2 -translate-x-1/2 z-50 flex items-center px-4 py-3 rounded-xl shadow-2xl border backdrop-blur-md animate-in slide-in-from-top-4 fade-in duration-300 ${toast.type === 'error' ? 'bg-red-50/90 border-red-200 text-red-800' : 'bg-emerald-50/90 border-emerald-200 text-emerald-800'}`}>
          {toast.type === 'error' ? <AlertCircle className="w-5 h-5 mr-2" /> : <Check className="w-5 h-5 mr-2" />}
          <span className="font-medium text-sm">{toast.message}</span>
        </div>
      )}

      <aside className={`w-64 bg-slate-900 text-slate-300 flex flex-col transition-all duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} absolute md:relative z-40 h-full shadow-2xl md:shadow-none`}>
        <div className="h-16 flex items-center px-6 border-b border-slate-800">
          <BookOpenIcon className="w-6 h-6 text-indigo-400 mr-3" />
          <span className="font-bold text-white tracking-wide">พื้นที่ทำงาน</span>
          <button onClick={() => setSidebarOpen(false)} className="ml-auto md:hidden text-slate-400 hover:text-white"><X className="w-5 h-5"/></button>
        </div>
        
        <div className="p-4 flex-1 overflow-y-auto custom-scrollbar">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 px-2">เครื่องมือ AI</div>
          <div className="space-y-1">
            {modes.map((mode) => (
              <button
                key={mode.id}
                onClick={() => setActiveMode(mode.id)}
                className={`w-full flex items-center px-3 py-2.5 rounded-lg text-sm transition-all ${activeMode === mode.id ? 'bg-indigo-600 text-white shadow-md' : 'hover:bg-slate-800 hover:text-slate-100'}`}
                title={mode.desc}
              >
                <span className={`mr-3 ${activeMode === mode.id ? 'text-indigo-200' : 'text-slate-400'}`}>{mode.icon}</span>
                <span className="font-medium text-left leading-tight">{mode.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 border-t border-slate-800">
          <button onClick={() => setCurrentView('home')} className="w-full flex items-center px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
            <LayoutDashboard className="w-4 h-4 mr-3" /> ออกจากพื้นที่ทำงาน
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col h-full relative w-full">
        
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-8 shrink-0 shadow-sm z-10">
          <div className="flex items-center">
            <button onClick={() => setSidebarOpen(true)} className="mr-4 md:hidden text-slate-500 hover:text-slate-900">
              <Menu className="w-6 h-6" />
            </button>
            <h2 className="text-lg font-bold text-slate-800">{modes.find(m => m.id === activeMode)?.name}</h2>
          </div>
          
          <div className="flex-1 max-w-xl mx-8 hidden lg:flex items-center bg-slate-50 border border-slate-200 rounded-full px-4 py-1.5 focus-within:ring-2 ring-indigo-500/20 transition-all">
            <MessageSquare className="w-4 h-4 text-slate-400 mr-2" />
            <input
              type="text"
              className="w-full bg-transparent border-none text-sm focus:outline-none text-slate-700 placeholder:text-slate-400"
              placeholder="เพิ่มคำสั่งพิเศษให้ AI (เช่น 'ขอแบบเป็นทางการมากๆ' หรือ 'เน้นทฤษฎี')..."
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
            />
          </div>

          <button
            onClick={handleProcess}
            disabled={isProcessing}
            className="flex items-center px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-full text-sm font-semibold shadow-md transition-all active:scale-95 whitespace-nowrap"
          >
            {isProcessing ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> กำลังประมวลผล...</> : <><Sparkles className="w-4 h-4 mr-2" /> ประมวลผล AI</>}
          </button>
        </header>

        <div className="flex-1 p-4 lg:p-6 overflow-hidden flex flex-col lg:flex-row gap-6">
          
          {/* Panel 1: Literature (Map/Text Toggle) */}
          <div className="flex-1 flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden relative group">
            <div className="px-3 py-2 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center space-x-2">
                <div className="flex bg-slate-200/60 p-1 rounded-lg">
                  <button 
                    onClick={() => setReferenceViewMode('text')} 
                    className={`flex items-center px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-colors ${referenceViewMode === 'text' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    <FileText className="w-3.5 h-3.5 mr-1.5" /> ข้อความ
                  </button>
                  <button 
                    onClick={() => setReferenceViewMode('map')} 
                    className={`flex items-center px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-colors ${referenceViewMode === 'map' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    <Map className="w-3.5 h-3.5 mr-1.5" /> แผนที่ค้นหา
                  </button>
                </div>

                <select
                  value={dataSource}
                  onChange={(e) => setDataSource(e.target.value)}
                  className="text-[11px] font-medium bg-white border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  title="เลือกฐานข้อมูล"
                >
                  <option value="openalex">OpenAlex (นานาชาติ & ไทย)</option>
                  <option value="mhesi">MHESI Open Data (งานวิจัยไทย)</option>
                  <option value="thaijo">ThaiJO (วารสารวิชาการไทย)</option>
                  <option value="semanticscholar">Semantic Scholar</option>
                </select>
              </div>

              <div className="flex space-x-1">
                <button onClick={handleFetchOnlineArticles} className="p-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg transition-colors shadow-sm" title="สร้างแผนที่อัตโนมัติจากแบบร่าง">
                  {isFetchingArticles ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                </button>
                <label className="p-2 hover:bg-slate-100 text-slate-600 rounded-lg transition-colors cursor-pointer" title="อัปโหลด PDF หรือ Text">
                  <Upload className="w-4 h-4" />
                  <input type="file" accept=".txt,.pdf" className="hidden" onChange={handleFileUpload} />
                </label>
              </div>
            </div>

            {referenceViewMode === 'text' ? (
                <textarea
                  className="flex-1 w-full p-4 resize-none focus:outline-none text-slate-700 text-sm leading-relaxed custom-scrollbar placeholder:text-slate-300"
                  placeholder="วางเอกสารอ้างอิง โน้ตย่อ หรืออัปโหลดไฟล์ PDF หรือใช้โหมด 'แผนที่ค้นหา' เพื่อดึงงานวิจัยมาอัตโนมัติ..."
                  value={referenceText}
                  onChange={(e) => setReferenceText(e.target.value)}
                />
            ) : (
                renderLiteratureMap()
            )}
          </div>

          {/* Panel 2: Draft */}
          <div className="flex-1 flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <div className="flex items-center space-x-3">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center whitespace-nowrap">
                  <PenTool className="w-4 h-4 mr-2 text-emerald-500" /> แบบร่าง
                </span>
                {activeMode === 'auto-thesis' && (
                  <select
                    value={thesisType}
                    onChange={(e) => setThesisType(e.target.value)}
                    className="text-[11px] bg-white border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-indigo-300 text-slate-600 font-medium shadow-sm max-w-[140px] lg:max-w-none truncate"
                  >
                    <option value="phd">ระดับปริญญาเอก</option>
                    <option value="master">ระดับปริญญาโท</option>
                    <option value="bachelor">ระดับปริญญาตรี</option>
                    <option value="paper">บทความวิจัย/ตีพิมพ์</option>
                  </select>
                )}
              </div>
              <button 
                onClick={handlePlagiarismScan}
                disabled={isProcessing}
                className="flex items-center px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 disabled:opacity-50 rounded text-[10px] font-bold uppercase tracking-wider transition-colors shadow-sm border border-rose-100 whitespace-nowrap"
                title="สแกนการคัดลอก และการอ้างอิงที่หายไป"
              >
                {isProcessing && activeMode === 'plagiarism-check' ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <ShieldAlert className="w-3 h-3 mr-1" />}
                ตรวจคัดลอกซ้ำ
              </button>
            </div>
            <textarea
              className="flex-1 w-full p-4 resize-none focus:outline-none text-slate-700 text-sm leading-relaxed custom-scrollbar placeholder:text-slate-300"
              placeholder="วางแบบร่างที่ต้องการแก้ไข หรือหัวข้อคร่าวๆ ของคุณที่นี่..."
              value={thesisText}
              onChange={(e) => setThesisText(e.target.value)}
            />
          </div>

          {/* Panel 3: AI Output */}
          <div className="flex-[1.2] flex flex-col bg-white rounded-xl shadow-lg border border-indigo-100 overflow-hidden ring-1 ring-indigo-50 relative">
            <div className="px-4 py-3 border-b border-indigo-50 bg-indigo-50/30 flex justify-between items-center">
              <span className="text-xs font-bold text-indigo-800 uppercase tracking-wider flex items-center">
                <Sparkles className="w-4 h-4 mr-2 text-indigo-500" /> ผลลัพธ์จาก AI
              </span>
              <button onClick={handleCopy} disabled={!improvedText} className="p-1.5 hover:bg-indigo-100 text-indigo-700 rounded-md disabled:opacity-30 transition-colors">
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 bg-white custom-scrollbar relative">
              {isProcessing && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center z-10">
                  <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
                  <p className="text-sm font-medium text-indigo-800 animate-pulse">
                    {activeMode === 'plagiarism-check' ? 'กำลังตรวจสอบการคัดลอก (Plagiarism)...' : 
                     activeMode === 'deep-paraphrase' ? 'กำลังเรียบเรียงโครงสร้างใหม่ขั้นสูง...' : 
                     activeMode === 'auto-thesis' ? 'กำลังสร้างโครงร่างวิทยานิพนธ์ฉบับสมบูรณ์...' : 
                     activeMode === 'academic' ? 'กำลังปรับเปลี่ยนเป็นภาษาไทยระดับวิชาการ...' : 
                     activeMode === 'write-beautifully' ? 'กำลังขัดเกลาสำนวนให้สละสลวย...' : 'กำลังวิเคราะห์และสังเคราะห์ข้อมูล...'}
                  </p>
                </div>
              )}
              
              {!improvedText && !isProcessing ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                  <FileText className="w-12 h-12 mb-3 text-slate-200" />
                  <p className="text-sm">เอกสารที่จัดรูปแบบแล้วของคุณจะปรากฏที่นี่</p>
                </div>
              ) : (
                <div className="text-sm">
                  {formatRichText(improvedText)}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 20px; }
        @keyframes blob { 0% { transform: translate(0px, 0px) scale(1); } 33% { transform: translate(30px, -50px) scale(1.1); } 66% { transform: translate(-20px, 20px) scale(0.9); } 100% { transform: translate(0px, 0px) scale(1); } }
        .animate-blob { animation: blob 7s infinite; }
        .animation-delay-2000 { animation-delay: 2s; }
        .animation-delay-4000 { animation-delay: 4s; }
      `}} />
    </div>
  );
}

function BookOpenIcon(props) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}