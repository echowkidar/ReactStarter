// Department user guide (English + easy Hindi). Content is plain data; the look comes from the help kit.
import {
  ArrowRightLeft, Bot, CalendarClock, ClipboardList, FileImage, FileSignature,
  FolderOpen, HelpCircle, LayoutDashboard, LogIn, Mail, Printer, ReceiptText, RotateCcw, Search, Send, Settings, Ticket,
  UserCog, Users, Wallet,
} from "lucide-react";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { HelpGuide, type Bi, type HelpTopic } from "@/components/help/help-kit";

const b = (en: string, hi: string): Bi => ({ en, hi });

const FUND = "Revolving Funds or Other Similar Funds";

const G_START = b("Getting started", "शुरुआत");
const G_STAFF = b("Staff", "कर्मचारी");
const G_ATT = b("Attendance", "उपस्थिति");
const G_COMM = b("Communication and papers", "पत्राचार और काग़ज़ात");
const G_ACC = b("Account and help", "खाता और मदद");

const quickStart: Bi[] = [
  b("Log in with the e-mail and password given to you. Then open **Settings** and fill **HOD Title**, **HOD Name**, your e-mail, and set a new password.",
    "आपको मिले ई-मेल और पासवर्ड से लॉगिन करें। फिर **Settings** खोलें और **HOD Title**, **HOD Name**, अपना ई-मेल भरें और नया पासवर्ड बनाएँ।"),
  b("Open **Employees** and check your list. Add missing staff with **Add Employee**.",
    "**Employees** खोलकर अपनी सूची जाँचें। जो कर्मचारी छूटे हैं उन्हें **Add Employee** से जोड़ें।"),
  b("Go to **Attendance** and click **Create Report**. Tick the staff, check the dates and days, and save. This is a **draft**.",
    "**Attendance** में जाकर **Create Report** दबाएँ। कर्मचारियों पर टिक लगाएँ, तारीख और दिन जाँचें और सेव करें। यह **draft** रहता है।"),
  b("Click **Finalize**, then open **View / Print Final Report**, print it, get it signed by the HOD and write the despatch number and date on it.",
    "**Finalize** दबाएँ, फिर **View / Print Final Report** खोलकर प्रिंट निकालें, HOD से हस्ताक्षर कराएँ और उस पर Despatch नंबर व तारीख लिखें।"),
  b("Click **Upload Signed Report**, choose the scan or take a photo, enter **Despatch No** and **Despatch Date**, and press **Submit**. The report goes to the section.",
    "**Upload Signed Report** दबाएँ, स्कैन चुनें या फ़ोटो लें, **Despatch No** और **Despatch Date** भरें और **Submit** दबाएँ। रिपोर्ट सेक्शन को चली जाती है।"),
  b("Remember: regular staff report by the **15th**. Staff whose Employee ID starts with a letter go in a separate report, by the **last day of the month**.",
    "याद रखें: सामान्य स्टाफ की रिपोर्ट **15 तारीख** तक। जिनका Employee ID अक्षर से शुरू होता है उनकी अलग रिपोर्ट **महीने के आख़िरी दिन** तक।"),
];

const topics: HelpTopic[] = [
  // ───────────────────────── Getting started ─────────────────────────
  {
    id: "login", icon: LogIn, group: G_START,
    title: b("Logging in and first-time setup", "लॉगिन और पहली बार की सेटिंग"),
    summary: b("Sign in, fill your details in Settings, forgot password", "लॉगिन करें, Settings में अपनी जानकारी भरें, पासवर्ड भूल जाएँ तो क्या करें"),
    blocks: [
      { kind: "steps", items: [
        b("Open the portal. The **Department Login** page opens.", "पोर्टल खोलें। **Department Login** पेज खुलेगा।"),
        b("Type your **Email** and **Password**.", "अपना **Email** और **Password** लिखें।"),
        b("Click **Sign In to Dashboard**.", "**Sign In to Dashboard** दबाएँ।"),
      ] },
      { kind: "note", text: b(
        "Staff logins (HOD, Section Officer, Dealing Assistant, Diary Clerk) use the same page with their own e-mail. **Admin Login** is only for the administrators.",
        "स्टाफ लॉगिन (HOD, Section Officer, Dealing Assistant, Diary Clerk) भी इसी पेज पर अपने ई-मेल से लॉगिन करते हैं। **Admin Login** सिर्फ़ एडमिन के लिए है।") },
      { kind: "para", text: b("**First time? The password you were given is temporary.** Open **Settings** and do this:",
        "**पहली बार? जो पासवर्ड मिला है वह अस्थायी है।** **Settings** खोलें और यह करें:") },
      { kind: "steps", items: [
        b("On the **Profile** tab fill **HOD Title** (for example Chairperson), **HOD Name** and your **Email**. The **Department Name** cannot be changed.",
          "**Profile** टैब में **HOD Title** (जैसे Chairperson), **HOD Name** और अपना **Email** भरें। **Department Name** बदला नहीं जा सकता।"),
        b("Click **Update Profile**.", "**Update Profile** दबाएँ।"),
        b("On the **Password** tab enter **Current Password**, **New Password** (at least 8 characters) and **Confirm Password**. Click **Change Password**.",
          "**Password** टैब में **Current Password**, **New Password** (कम से कम 8 अक्षर) और **Confirm Password** भरें। **Change Password** दबाएँ।"),
      ] },
      { kind: "warn", text: b(
        "Settings shows this message: update your HOD Title, HOD Name, Email and Password before creating Attendance Reports. Use a working e-mail: all mails of the portal (reports, reminders, password reset) go to it.",
        "Settings में यह संदेश आता है: अटेंडेंस रिपोर्ट बनाने से पहले HOD Title, HOD Name, Email और Password बदलें। चालू ई-मेल ही डालें, क्योंकि पोर्टल के सारे मेल (रिपोर्ट, रिमाइंडर, पासवर्ड रीसेट) उसी पर आते हैं।") },
      { kind: "para", text: b("**Forgot your password?** Click **Forgot Password?** under the login box and enter your e-mail. A reset link comes to your e-mail. The link works for 1 hour only. After many wrong passwords the login is locked for some minutes; wait and try again.",
        "**पासवर्ड भूल गए?** लॉगिन बॉक्स के नीचे **Forgot Password?** दबाएँ और अपना ई-मेल लिखें। आपके ई-मेल पर रीसेट लिंक आएगा। यह लिंक सिर्फ़ 1 घंटे चलता है। कई बार ग़लत पासवर्ड डालने पर लॉगिन कुछ मिनट के लिए बंद हो जाता है; रुककर फिर कोशिश करें।") },
      { kind: "tip", text: b("The login page also has the tutorial video and a **Useful Downloads** list. Employees can open **Pay Slip** and (when open) **Fill a claim form online** from the same page, without a login.",
        "लॉगिन पेज पर ट्यूटोरियल वीडियो और **Useful Downloads** की सूची भी है। कर्मचारी इसी पेज से बिना लॉगिन के **Pay Slip** और (जब खुला हो) **Fill a claim form online** खोल सकते हैं।") },
    ],
  },
  {
    id: "dashboard", icon: LayoutDashboard, group: G_START,
    title: b("Dashboard", "डैशबोर्ड"),
    summary: b("Cards, notices, notification bell and the deadline pop-up", "कार्ड, नोटिस, घंटी और डेडलाइन पॉप-अप"),
    blocks: [
      { kind: "para", text: b("The menu is on the left. The **Dashboard** shows cards. Click a card to open that page.",
        "मेन्यू बाईं तरफ़ है। **Dashboard** पर कार्ड दिखते हैं। किसी कार्ड पर क्लिक करने से वह पेज खुलता है।") },
      { kind: "terms", items: [
        { term: b("Total Active Employees", "Total Active Employees"), text: b("Number of active staff in your department.", "आपके विभाग के चालू कर्मचारियों की संख्या।") },
        { term: b("Attendance Reports", "Attendance Reports"), text: b("Number of attendance reports made by your department.", "आपके विभाग की बनी अटेंडेंस रिपोर्टों की संख्या।") },
        { term: b("Transfer Requests", "Transfer Requests"), text: b("Employees another department wants to send to you. Click to **Accept Transfer** or **Reject**. The pop-up opens by itself when something is waiting.", "दूसरे विभाग से आपके पास भेजे जा रहे कर्मचारी। **Accept Transfer** या **Reject** करने के लिए क्लिक करें। कुछ इंतज़ार में हो तो पॉप-अप अपने आप खुल जाता है।") },
        { term: b("Release Requests", "Release Requests"), text: b("Another department asks you to release one of your employees. It says **Action Required**.", "दूसरा विभाग आपसे आपका कोई कर्मचारी छोड़ने को कह रहा है। इस पर **Action Required** लिखा आता है।") },
        { term: b("Reporting Employees", "Reporting Employees"), text: b("Only for departments where Admin has switched this on.", "सिर्फ़ उन विभागों में जहाँ एडमिन ने यह चालू किया है।") },
        { term: b("Support Tickets", "Support Tickets"), text: b("Your tickets: Open, In Progress, Resolved, Closed.", "आपके टिकट: Open, In Progress, Resolved, Closed।") },
        { term: b("Dak Receive/Dispatch", "Dak Receive/Dispatch"), text: b("Sent, Received and Unread letters.", "भेजे गए, मिले हुए और बिना पढ़े पत्र।") },
      ] },
      { kind: "para", text: b("**Notices:** the notices from the university appear at the bottom of the left menu (last 5). Click one to read it in full.",
        "**Notices:** विश्वविद्यालय के नोटिस बाएँ मेन्यू में नीचे दिखते हैं (आख़िरी 5)। पूरा पढ़ने के लिए उस पर क्लिक करें।") },
      { kind: "para", text: b("**Bell:** the bell icon next to the department name shows your notifications. Use **Mark all read** to clear the red number. Small numbers on **Email**, **Dak Receive/Dispatch** and **Claim Forms** in the menu show new items.",
        "**घंटी:** विभाग के नाम के पास की घंटी में आपकी सूचनाएँ दिखती हैं। लाल संख्या हटाने के लिए **Mark all read** दबाएँ। मेन्यू में **Email**, **Dak Receive/Dispatch** और **Claim Forms** के पास की छोटी संख्या नई चीज़ें बताती है।") },
      { kind: "warn", text: b(
        "**Deadline pop-up.** After the 15th, if your attendance portal is closed, a red **DEADLINE PASSED** pop-up opens. It says the portal reopens on the **20th** of the month (or the next working day if the 20th is a Sunday or holiday) for a few hours. Click **Continue to Dashboard** to close it. If you have staff with Employee ID starting with a letter, the pop-up also tells you their date is different (last day of the month).",
        "**डेडलाइन पॉप-अप।** 15 तारीख़ के बाद अगर आपका अटेंडेंस पोर्टल बंद है तो लाल **DEADLINE PASSED** पॉप-अप खुलता है। इसमें लिखा होता है कि पोर्टल महीने की **20 तारीख़** को (20 को रविवार या छुट्टी हो तो अगले कार्य-दिवस पर) कुछ घंटों के लिए फिर खुलेगा। बंद करने के लिए **Continue to Dashboard** दबाएँ। अगर आपके यहाँ ऐसे कर्मचारी हैं जिनका Employee ID अक्षर से शुरू होता है, तो पॉप-अप में उनकी अलग तारीख़ (महीने का आख़िरी दिन) भी लिखी आती है।") },
    ],
  },

  // ───────────────────────── Staff ─────────────────────────
  {
    id: "employees", icon: Users, group: G_STAFF,
    title: b("Employees: list, add and edit", "कर्मचारी: सूची, जोड़ना और बदलना"),
    summary: b("Keep the list correct; the attendance form takes staff from here", "सूची सही रखें; अटेंडेंस फ़ॉर्म में कर्मचारी यहीं से आते हैं"),
    blocks: [
      { kind: "para", text: b("Open **Employees**. The table shows EPID, Name, Designation, Employment Status, Pay Level, Status and Term Expiry. Use the search box (ID, name or designation). The **Employees Status** buttons **Active** and **Disabled** choose which staff you see.",
        "**Employees** खोलें। तालिका में EPID, Name, Designation, Employment Status, Pay Level, Status और Term Expiry दिखते हैं। खोज बॉक्स में ID, नाम या पद लिखें। **Employees Status** के **Active** और **Disabled** बटन से चुनें कि कौन से कर्मचारी दिखें।") },
      { kind: "para", text: b("In each row: the arrows **Move Up / Move Down** change the order (clear the search first), the eye opens **Employee Details** with documents, the history button shows all changes, and the pencil edits.",
        "हर पंक्ति में: तीर **Move Up / Move Down** क्रम बदलते हैं (पहले खोज साफ़ करें), आँख का निशान दस्तावेज़ों के साथ **Employee Details** खोलता है, history बटन सारे बदलाव दिखाता है और पेंसिल से एडिट होता है।") },
      { kind: "para", text: b("**Add a new employee:**", "**नया कर्मचारी जोड़ना:**") },
      { kind: "steps", items: [
        b("Click **Add Employee**.", "**Add Employee** दबाएँ।"),
        b("Fill **Basic Information**: EPID, Name, Designation, Employment Status, Pay Level (and **Term Expiry Date** where it is asked).", "**Basic Information** भरें: EPID, Name, Designation, Employment Status, Pay Level (और जहाँ माँगा जाए वहाँ **Term Expiry Date**)।"),
        b("Fill **Identification Details** (PAN Number, Bank Account, Adhar Number) and **Office Details** (Office Memo No., Joining Date, Joining Shift, Salary Register No., **Salary Assistant**). Salary Assistant is required.", "**Identification Details** (PAN Number, Bank Account, Adhar Number) और **Office Details** (Office Memo No., Joining Date, Joining Shift, Salary Register No., **Salary Assistant**) भरें। Salary Assistant ज़रूरी है।"),
        b("Upload the documents under **Document Upload** (PAN Card, Bank Account Proof, Adhar Number, Office Memo, Joining Report).", "**Document Upload** में दस्तावेज़ चढ़ाएँ (PAN Card, Bank Account Proof, Adhar Number, Office Memo, Joining Report)।"),
        b("Save the form.", "फ़ॉर्म सेव करें।"),
      ] },
      { kind: "warn", text: b("**EPID** is 5 digits (for example 24600) or 1 letter and 4 digits (for example R0001). If the EPID already exists in another department, the form says **Employee Already Exists**. Close it, go to **Global Search**, search the EPID and click **Request Release**.",
        "**EPID** 5 अंक का (जैसे 24600) या 1 अक्षर और 4 अंक का (जैसे R0001) होता है। अगर वह EPID किसी दूसरे विभाग में पहले से है तो फ़ॉर्म में **Employee Already Exists** आता है। फ़ॉर्म बंद करें, **Global Search** में जाकर EPID खोजें और **Request Release** दबाएँ।") },
      { kind: "para", text: b("**Edit an employee:** click the pencil. You can change documents, bank details, joining details, **Remarks** and the **Status**. The EPID is locked. **Name, Designation, Salary Register No. and Salary Assistant can be changed only by Admin**; if one is wrong, raise a **Support Tickets** ticket.",
        "**कर्मचारी बदलना:** पेंसिल पर क्लिक करें। आप दस्तावेज़, बैंक की जानकारी, जॉइनिंग की जानकारी, **Remarks** और **Status** बदल सकते हैं। EPID बंद (locked) रहता है। **Name, Designation, Salary Register No. और Salary Assistant सिर्फ़ एडमिन बदल सकता है**; इनमें ग़लती हो तो **Support Tickets** में टिकट डालें।") },
      { kind: "para", text: b("**Disable an employee** (retired, resigned and so on): in the edit form choose **Disabled**. The portal asks for a reason (Retire/VRS, Resign, Term Complete, Terminate, Expired, Long Leave, Deputation) and the date from which it is effective (WEF). A disabled employee does not come in the attendance form.",
        "**कर्मचारी को Disabled करना** (रिटायर, इस्तीफ़ा आदि): एडिट फ़ॉर्म में **Disabled** चुनें। पोर्टल कारण (Retire/VRS, Resign, Term Complete, Terminate, Expired, Long Leave, Deputation) और किस तारीख़ से लागू (WEF) पूछता है। Disabled कर्मचारी अटेंडेंस फ़ॉर्म में नहीं आता।") },
      { kind: "warn", text: b("You cannot disable an employee who is in this month's attendance report (message **Cannot Disable Employee**). Cancel or recall that report first, or ask Admin.",
        "जो कर्मचारी इस महीने की अटेंडेंस रिपोर्ट में है उसे आप Disable नहीं कर सकते (संदेश **Cannot Disable Employee**)। पहले वह रिपोर्ट रद्द करें या वापस लें, या एडमिन से कहें।") },
      { kind: "para", text: b(`**Staff whose Employee ID starts with a letter** (for example R0001) are **${FUND}** staff. They are shown in a separate group under the heading **${FUND}**. For them the form has some differences:`,
        `**जिन कर्मचारियों का Employee ID अक्षर से शुरू होता है** (जैसे R0001) वे **${FUND}** के स्टाफ हैं। वे सूची में **${FUND}** शीर्षक के अलग समूह में दिखते हैं। इनके लिए फ़ॉर्म में कुछ फ़र्क़ है:`) },
      { kind: "list", items: [
        b("Employment Status has its own list (for example Revolving Fund, Bill, Student Fund, Other Fund). **Term Expiry Date** is always needed.", "Employment Status की अलग सूची है (जैसे Revolving Fund, Bill, Student Fund, Other Fund)। **Term Expiry Date** हमेशा ज़रूरी है।"),
        b("**Salary Assistant** is the section: ACC (Accounts Section), BIL (Bill Section), STU (Students Section) or OTH (Others). This decides which section receives the attendance.", "**Salary Assistant** यहाँ सेक्शन है: ACC (Accounts Section), BIL (Bill Section), STU (Students Section) या OTH (Others)। इसी से तय होता है कि अटेंडेंस किस सेक्शन को जाएगी।"),
        b("A **Wages payroll** block appears: **Wage Category** (required), Monthly fixed wages, Fund (Payment Code), EPF / UAN, ESI, MAS, and bank name, branch and IFSC.", "**Wages payroll** का हिस्सा आता है: **Wage Category** (ज़रूरी), Monthly fixed wages, Fund (Payment Code), EPF / UAN, ESI, MAS और बैंक का नाम, ब्रांच व IFSC।"),
      ] },
      { kind: "note", text: b("A numeric EPID is regular staff and a letter EPID is fund staff. The two kinds go in different attendance reports.",
        "अंकों वाला EPID सामान्य स्टाफ है और अक्षर वाला EPID फंड स्टाफ। दोनों की अटेंडेंस अलग-अलग रिपोर्ट में जाती है।") },
    ],
  },
  {
    id: "transfers", icon: ArrowRightLeft, group: G_STAFF,
    title: b("Transfer and release requests", "ट्रांसफ़र और रिलीज़ के अनुरोध"),
    summary: b("Sending an employee to another department, and getting one to yours", "कर्मचारी को दूसरे विभाग भेजना और अपने विभाग में लाना"),
    blocks: [
      { kind: "para", text: b("**Send your employee to another department:**", "**अपना कर्मचारी दूसरे विभाग भेजना:**") },
      { kind: "steps", items: [
        b("Open the employee with the pencil and click **Transfer to Another Department** (only for an active employee with no pending request).", "पेंसिल से कर्मचारी खोलें और **Transfer to Another Department** दबाएँ (सिर्फ़ चालू कर्मचारी के लिए, जिसका कोई अनुरोध बाक़ी न हो)।"),
        b("Fill **Transfer To Department**, **Order Number**, **Order Date** and **Relieving Date** (all needed) and the **Remarks**.", "**Transfer To Department**, **Order Number**, **Order Date** और **Relieving Date** (सब ज़रूरी) और **Remarks** भरें।"),
        b("Click **Send Transfer Request**. The employee shows a **Transfer** mark in your list until the other department answers.", "**Send Transfer Request** दबाएँ। दूसरा विभाग जवाब दे, तब तक सूची में कर्मचारी पर **Transfer** का निशान रहता है।"),
      ] },
      { kind: "para", text: b("**The other department** sees it on its dashboard under **Transfer Requests** and clicks **Accept Transfer** or **Reject** (it must write a reason). On accept, the employee moves to that department. If it is rejected you see **Last Transfer Request Rejected by** in the edit form.",
        "**दूसरा विभाग** इसे अपने डैशबोर्ड पर **Transfer Requests** में देखता है और **Accept Transfer** या **Reject** दबाता है (Reject पर कारण लिखना पड़ता है)। Accept होते ही कर्मचारी उस विभाग में चला जाता है। Reject हो जाए तो एडिट फ़ॉर्म में **Last Transfer Request Rejected by** दिखता है।") },
      { kind: "para", text: b("**Bring an employee from another department:**", "**दूसरे विभाग से कर्मचारी अपने यहाँ लाना:**") },
      { kind: "steps", items: [
        b("Open **Global Search**, type at least 2 letters of the name or the EPID and click **Search**.", "**Global Search** खोलें, नाम या EPID के कम से कम 2 अक्षर लिखें और **Search** दबाएँ।"),
        b("For an active employee click **Request Release** and write remarks.", "चालू कर्मचारी के लिए **Request Release** दबाएँ और Remarks लिखें।"),
        b("The employee's present department sees it under **Release Requests** and clicks **Approve & Release** (then **Confirm Release**) or **Reject**.", "कर्मचारी का मौजूदा विभाग इसे **Release Requests** में देखता है और **Approve & Release** (फिर **Confirm Release**) या **Reject** दबाता है।"),
        b("For an **inactive** employee the button is **Pull Employee**: he or she moves to your department at once.", "**Inactive** कर्मचारी के लिए बटन **Pull Employee** है: वह उसी समय आपके विभाग में आ जाता है।"),
      ] },
      { kind: "warn", text: b("A transfer or release is blocked when a full-month attendance (1st to last day) of the present month is already created or sent for that employee. The message tells you which department made it. Try again next month, or ask that department to cancel its report.",
        "अगर उस कर्मचारी की इस महीने की पूरे महीने (1 तारीख़ से आख़िरी दिन) की अटेंडेंस पहले से बनी या भेजी जा चुकी है तो ट्रांसफ़र या रिलीज़ रुक जाता है। संदेश में उस विभाग का नाम होता है। अगले महीने कोशिश करें, या उस विभाग से रिपोर्ट रद्द करने को कहें।") },
      { kind: "note", text: b("Admin can also move an employee between departments. Fields only Admin can change (name, designation and similar) are explained in the Employees topic.",
        "एडमिन भी कर्मचारी को एक विभाग से दूसरे में कर सकता है। जो बातें सिर्फ़ एडमिन बदल सकता है (नाम, पद आदि) वे Employees वाले विषय में लिखी हैं।") },
    ],
  },
  {
    id: "global-search", icon: Search, group: G_STAFF,
    title: b("Global Search", "Global Search (सबमें खोज)"),
    summary: b("Find an employee of any department", "किसी भी विभाग का कर्मचारी खोजें"),
    blocks: [
      { kind: "para", text: b("Use **Global Search** to find an employee of the whole university by name or EPID (at least 2 characters). The result shows designation, present department and status.",
        "**Global Search** से पूरे विश्वविद्यालय का कोई भी कर्मचारी नाम या EPID (कम से कम 2 अक्षर) से खोजा जा सकता है। नतीजे में पद, मौजूदा विभाग और स्थिति दिखती है।") },
      { kind: "list", items: [
        b("**Request Release**: ask the present department to send the employee to you.", "**Request Release**: मौजूदा विभाग से कर्मचारी को अपने यहाँ भेजने को कहें।"),
        b("**Pull Employee**: for an inactive employee; he or she moves to you at once.", "**Pull Employee**: Inactive कर्मचारी के लिए; वह उसी समय आपके पास आ जाता है।"),
        b("**Add as Reporting Employee**: only if Admin has enabled Reporting Employees for you. Then that employee's attendance goes in the separate **Reporting Employees** report.", "**Add as Reporting Employee**: सिर्फ़ तब जब एडमिन ने आपके लिए Reporting Employees चालू किया हो। तब उस कर्मचारी की अटेंडेंस अलग **Reporting Employees** रिपोर्ट में जाती है।"),
      ] },
    ],
  },
  {
    id: "payslips", icon: ReceiptText, group: G_STAFF,
    title: b("Pay slips of wage staff", "वेतन-पर्ची (Pay Slip): फंड स्टाफ के लिए"),
    summary: b(`For ${FUND} staff, from the login page, no login needed`, `${FUND} के स्टाफ के लिए, लॉगिन पेज से, लॉगिन की ज़रूरत नहीं`),
    blocks: [
      { kind: "para", text: b(`Employees whose Employee ID starts with a letter can see and print their own pay slip. Tell them to do this:`,
        `जिन कर्मचारियों का Employee ID अक्षर से शुरू होता है वे अपनी वेतन-पर्ची खुद देख और प्रिंट कर सकते हैं। उन्हें यह बताएँ:`) },
      { kind: "steps", items: [
        b("Open the portal's login page and click the blue **Pay Slip (Revolving Funds or Other Similar Funds)** box. No login is needed.", "पोर्टल का लॉगिन पेज खोलें और नीले **Pay Slip (Revolving Funds or Other Similar Funds)** बॉक्स पर क्लिक करें। लॉगिन नहीं चाहिए।"),
        b("Enter the **Employee ID** (for example R0001) and either the **Date of joining** or the full **Bank account number**.", "**Employee ID** (जैसे R0001) लिखें और या तो **Date of joining** या पूरा **Bank account number** भरें।"),
        b("Choose the month, then **Print** or **Download PDF**.", "महीना चुनें, फिर **Print** या **Download PDF** दबाएँ।"),
      ] },
      { kind: "note", text: b("A month appears only after the section has paid the wages and released the pay slips. Until then the page says no pay slip is available yet. Your department does not release them.",
        "कोई महीना तभी दिखता है जब सेक्शन वेतन दे चुका हो और पे-स्लिप जारी कर दी हों। तब तक पेज पर लिखा आता है कि अभी कोई पे-स्लिप नहीं है। पे-स्लिप जारी करना आपके विभाग का काम नहीं है।") },
    ],
  },

  // ───────────────────────── Attendance ─────────────────────────
  {
    id: "attendance-regular", icon: ClipboardList, group: G_ATT,
    title: b("Monthly attendance of regular staff", "सामान्य स्टाफ की मासिक उपस्थिति"),
    summary: b("Create, finalize, print and sign, upload, send. Deadline: 15th", "बनाएँ, Finalize करें, प्रिंट व हस्ताक्षर, अपलोड, भेजें। अंतिम तारीख़: 15", ),
    blocks: [
      { kind: "para", text: b("This is for staff with a numeric Employee ID (for example 24600). The report goes to the **Salary Section**. Open **Attendance**. The list shows each report with Rec. No., Date, Month, Transaction ID, Status and Despatch Details.",
        "यह अंकों वाले Employee ID (जैसे 24600) के स्टाफ के लिए है। रिपोर्ट **Salary Section** को जाती है। **Attendance** खोलें। सूची में हर रिपोर्ट का Rec. No., Date, Month, Transaction ID, Status और Despatch Details दिखता है।") },
      { kind: "terms", items: [
        { term: b("draft", "draft"), text: b("Saved, not final. You can **Edit**, **Delete** or **Finalize**.", "सेव है, अंतिम नहीं। **Edit**, **Delete** या **Finalize** कर सकते हैं।") },
        { term: b("submitted", "submitted"), text: b("Finalized. Print, sign and upload now. You can still use **Revert to Draft**.", "Finalize हो गई। अब प्रिंट, हस्ताक्षर और अपलोड करें। **Revert to Draft** अब भी कर सकते हैं।") },
        { term: b("sent", "sent"), text: b("Uploaded and received by the section. It gets a Rec. No. and date.", "अपलोड हो गई और सेक्शन को मिल गई। इसे Rec. No. और तारीख़ मिलती है।") },
        { term: b("cancelled", "cancelled"), text: b("You cancelled a sent report. You can create a new one.", "आपने भेजी हुई रिपोर्ट रद्द की। अब नई बना सकते हैं।") },
      ] },
      { kind: "para", text: b("**Step 1. Create the report**", "**स्टेप 1. रिपोर्ट बनाना**") },
      { kind: "steps", items: [
        b("Click **Create Report**. Month and Year are fixed to the present month.", "**Create Report** दबाएँ। Month और Year मौजूदा महीने के तय रहते हैं।"),
        b("The table lists your active regular staff. Tick the staff you want (the **All** box at the top ticks everybody). Staff you do not tick are not in the report.", "तालिका में आपके चालू सामान्य कर्मचारी आते हैं। जिन्हें चाहिए उन पर टिक लगाएँ (ऊपर का **All** बॉक्स सबको टिक करता है)। जिन पर टिक नहीं वे रिपोर्ट में नहीं जाते।"),
        b("For each ticked person the period is the whole month by default: **From Date**, **To Date** and **Days** (Days is calculated by itself). Change the dates if the person worked only part of the month.", "टिक किए हर व्यक्ति का समय शुरू में पूरा महीना होता है: **From Date**, **To Date** और **Days** (Days अपने आप गिना जाता है)। अगर व्यक्ति ने महीने का कुछ हिस्सा ही काम किया तो तारीख़ें बदलें।"),
        b("If a person has a break, click **Add** to make a second period. The red **X** removes a period. Periods must not overlap.", "अगर बीच में छुट्टी है तो **Add** दबाकर दूसरा समय बनाएँ। लाल **X** समय हटाता है। समय आपस में टकराने नहीं चाहिए।"),
        b("Write a short reason in **Remarks** when needed.", "ज़रूरत हो तो **Remarks** में छोटा कारण लिखें।"),
        b("Click **Create Report** at the bottom of the form. The report is saved as **draft**.", "फ़ॉर्म के नीचे **Create Report** दबाएँ। रिपोर्ट **draft** में सेव हो जाती है।"),
      ] },
      { kind: "list", items: [
        b("**Guest Teacher / Guest Faculty:** type the total periods in **Fill Total Periods**. It cannot be 0. The original bill must go to the Salary Section.", "**Guest Teacher / Guest Faculty:** **Fill Total Periods** में कुल पीरियड लिखें। यह 0 नहीं हो सकता। मूल बिल Salary Section को भेजना होगा।"),
        b("**Daily wage designations:** a switch **One Day Break** sets the end date one day before month end (the 56-day rule). The form warns you if the person had no break last month.", "**दैनिक वेतन वाले पद:** **One Day Break** स्विच अंतिम तारीख़ को महीने के अंत से एक दिन पहले कर देता है (56 दिन का नियम)। पिछले महीने बिना ब्रेक के थे तो फ़ॉर्म चेतावनी देता है।"),
        b("**Term Check:** if a Temporary or Probation person's term ends before the attendance period, a red bar with **Resolve** appears. Update the term (**Extend Term**, **Fresh Appointment**, **Change Status / Confirm**), cut the attendance at the term date, choose **Order / Documents awaited**, or **Remove from report**. The report cannot be saved until every case is settled.", "**Term Check:** अगर Temporary या Probation वाले व्यक्ति का टर्म उपस्थिति-अवधि से पहले ख़त्म हो रहा है तो **Resolve** वाली लाल पट्टी आती है। टर्म बदलें (**Extend Term**, **Fresh Appointment**, **Change Status / Confirm**), उपस्थिति टर्म की तारीख़ तक रखें, **Order / Documents awaited** चुनें, या **Remove from report**। हर मामला निपटे बिना रिपोर्ट सेव नहीं होती।"),
        b("The form warns when a date range is wrong, when periods overlap, or when the same days were already sent for that person in another report.", "तारीख़ों की सीमा ग़लत हो, समय टकराएँ, या उसी व्यक्ति के वही दिन किसी दूसरी रिपोर्ट में पहले भेजे जा चुके हों तो फ़ॉर्म चेतावनी देता है।"),
      ] },
      { kind: "note", text: b("Only one draft can exist at a time, and only one **Main** report can be made per month. To change a draft, click **Edit** (the form button then says **Update Report**).",
        "एक समय में सिर्फ़ एक draft रह सकता है, और महीने में सिर्फ़ एक **Main** रिपोर्ट बन सकती है। draft बदलने के लिए **Edit** दबाएँ (तब फ़ॉर्म का बटन **Update Report** हो जाता है)।") },
      { kind: "para", text: b("**Step 2. Finalize**", "**स्टेप 2. Finalize करना**") },
      { kind: "steps", items: [
        b("Check the draft once with **View Draft Report**.", "पहले **View Draft Report** से draft देख लें।"),
        b("Click **Finalize**. A box explains the next steps. Click **I Understand, Finalize Now**.", "**Finalize** दबाएँ। एक बॉक्स अगले क़दम बताता है। **I Understand, Finalize Now** दबाएँ।"),
        b("The status becomes **submitted** and an 8-character **Transaction ID** is made. It is made again every time you finalize, so only the latest printed copy is accepted.", "स्टेटस **submitted** हो जाता है और 8 अक्षर की **Transaction ID** बनती है। हर बार Finalize करने पर नई बनती है, इसलिए सिर्फ़ सबसे नई छपी कॉपी मानी जाती है।"),
      ] },
      { kind: "para", text: b("**Step 3. Print and sign**", "**स्टेप 3. प्रिंट और हस्ताक्षर**") },
      { kind: "steps", items: [
        b("Click **View / Print Final Report** and then **Print**.", "**View / Print Final Report** दबाएँ, फिर **Print**।"),
        b("Get the HOD to sign it. Write the **Despatch number** and **date** in the D. No. / D. Date boxes on top.", "HOD से हस्ताक्षर कराएँ। ऊपर D. No. / D. Date के ख़ानों में **Despatch नंबर** और **तारीख़** लिखें।"),
      ] },
      { kind: "para", text: b("**Step 4. Upload and send**", "**स्टेप 4. अपलोड और भेजना**") },
      { kind: "steps", items: [
        b("Click **Upload Signed Report**.", "**Upload Signed Report** दबाएँ।"),
        b("Choose the file (PDF up to 5 MB, or JPEG / PNG image up to 2 MB). On a phone you can click **Take Photo**; the photo is straightened and cropped for you.", "फ़ाइल चुनें (PDF 5 MB तक, या JPEG / PNG फ़ोटो 2 MB तक)। फ़ोन में **Take Photo** दबा सकते हैं; फ़ोटो अपने आप सीधी और क्रॉप हो जाती है।"),
        b("The portal checks the copy automatically: first the picture quality (**Checking document quality...**), then it reads the **Transaction ID** from the paper.", "पोर्टल कॉपी अपने आप जाँचता है: पहले तस्वीर की गुणवत्ता (**Checking document quality...**), फिर काग़ज़ से **Transaction ID** पढ़ता है।"),
        b("If the ID is read and matches, it says **Transaction ID auto-detected and verified**. If it cannot be read, tick **I believe the PDF or image file is correct.** and type the ID printed on the paper in **Verify Transaction ID**.", "ID पढ़ी जाकर मेल खा जाए तो **Transaction ID auto-detected and verified** लिखा आता है। न पढ़ी जाए तो **I believe the PDF or image file is correct.** पर टिक लगाएँ और काग़ज़ पर छपी ID **Verify Transaction ID** में लिखें।"),
        b("Fill **Despatch No** and **Despatch Date** (the same as written on the paper).", "**Despatch No** और **Despatch Date** भरें (वही जो काग़ज़ पर लिखा है)।"),
        b("Click **Submit**. The report becomes **sent**, gets a Rec. No. and date, and you get an e-mail.", "**Submit** दबाएँ। रिपोर्ट **sent** हो जाती है, उसे Rec. No. और तारीख़ मिलती है और आपको ई-मेल आता है।"),
      ] },
      { kind: "warn", text: b("**Submit** stays blocked when the quality check fails or the Transaction ID does not match. If the message says **This does not appear to be the latest signed copy**, you are using an old print. Print the latest report again, sign it and upload that.",
        "जब गुणवत्ता जाँच फ़ेल हो या Transaction ID मेल न खाए तो **Submit** बंद रहता है। अगर संदेश **This does not appear to be the latest signed copy** आए तो आप पुरानी प्रिंट कॉपी लगा रहे हैं। नई रिपोर्ट फिर प्रिंट करें, हस्ताक्षर कराएँ और वही अपलोड करें।") },
      { kind: "para", text: b("After sending, the button changes to **View Signed Report**, where you can see the copy and the despatch details.",
        "भेजने के बाद बटन **View Signed Report** हो जाता है, जिसमें आप कॉपी और Despatch की जानकारी देख सकते हैं।") },
      { kind: "para", text: b("**Deadline: the 15th.** A coloured bar at the top of **Attendance** shows the days left. After the 15th the **Create Report** button is switched off (hover text: Deadline passed) unless Admin has given you permission. The portal **reopens on the 20th** (or the next working day if the 20th is a Sunday or holiday) for a few hours, so that departments who have not created their attendance can submit it. If the button says **Attendance submission disabled**, Admin has switched your attendance off; contact Admin.",
        "**अंतिम तारीख़: 15।** **Attendance** के ऊपर रंगीन पट्टी बचे हुए दिन दिखाती है। 15 के बाद **Create Report** बटन बंद हो जाता है (माउस रखने पर: Deadline passed), जब तक एडमिन ने आपको अनुमति न दी हो। पोर्टल **20 तारीख़ को** (20 को रविवार या छुट्टी हो तो अगले कार्य-दिवस पर) कुछ घंटों के लिए फिर खुलता है, ताकि जिन विभागों ने अटेंडेंस नहीं बनाई वे जमा कर सकें। अगर बटन पर **Attendance submission disabled** लिखा है तो एडमिन ने आपकी अटेंडेंस बंद की है; एडमिन से संपर्क करें।") },
      { kind: "tip", text: b("Optional report: if Admin enabled **Reporting Employees** for you, a **Create Reporting Employees Report** button appears. It works the same way, for staff of other departments who report to you.",
        "वैकल्पिक रिपोर्ट: अगर एडमिन ने आपके लिए **Reporting Employees** चालू किया है तो **Create Reporting Employees Report** बटन दिखता है। यह उसी तरह चलता है, उन दूसरे विभागों के कर्मचारियों के लिए जो आपके यहाँ रिपोर्ट करते हैं।") },
    ],
  },
  {
    id: "attendance-funds", icon: Wallet, group: G_ATT,
    title: b(`${FUND}: attendance of wage staff`, `${FUND}: वेतन-फंड स्टाफ की उपस्थिति`),
    summary: b("Employee ID starts with a letter. Separate report, due by the last day of the month", "Employee ID अक्षर से शुरू। अलग रिपोर्ट, महीने के आख़िरी दिन तक"),
    blocks: [
      { kind: "para", text: b(`Staff whose Employee ID starts with a letter (for example R0001) are not part of the regular report. Their attendance goes in the separate **${FUND}** report (printed as a **Muster Roll for Daily Wagers**).`,
        `जिन कर्मचारियों का Employee ID अक्षर से शुरू होता है (जैसे R0001) वे सामान्य रिपोर्ट में नहीं आते। उनकी उपस्थिति अलग **${FUND}** रिपोर्ट में जाती है (यह **Muster Roll for Daily Wagers** के रूप में छपती है)।`) },
      { kind: "terms", items: [
        { term: b("Who receives it", "किसे जाती है"), text: b("The **Accounts / Bill / Students Section**, as set by the employee's Salary Assistant (ACC, BIL or STU). It does **not** go to the Salary Section.", "**Accounts / Bill / Students Section** को, कर्मचारी के Salary Assistant (ACC, BIL या STU) के हिसाब से। यह **Salary Section** को **नहीं** जाती।") },
        { term: b("Due date", "अंतिम तारीख़"), text: b("The **last day of the month**. The section pays the wages by the **7th** of the next month. The 15th deadline does **not** apply.", "**महीने का आख़िरी दिन**। सेक्शन अगले महीने की **7 तारीख़** तक वेतन देता है। 15 तारीख़ वाली डेडलाइन यहाँ **लागू नहीं** होती।") },
        { term: b("When you can send", "कब भेज सकते हैं"), text: b("Only while the sections have the report **Open**. If it is closed the button is off and the page says it opens when the section opens it.", "सिर्फ़ तब जब सेक्शनों ने रिपोर्ट **Open** रखी हो। बंद हो तो बटन बंद रहता है और पेज पर लिखा आता है कि सेक्शन खोलेगा तब खुलेगी।") },
      ] },
      { kind: "steps", items: [
        b(`In **Attendance** click **Create ${FUND} Report**. The button appears only when you have active staff with a letter Employee ID.`, `**Attendance** में **Create ${FUND} Report** दबाएँ। यह बटन तभी दिखता है जब आपके पास अक्षर वाले Employee ID के चालू कर्मचारी हों।`),
        b("The table shows only the letter-ID staff. Tick the staff for the month.", "तालिका में सिर्फ़ अक्षर वाले ID के कर्मचारी आते हैं। महीने के लिए कर्मचारियों पर टिक लगाएँ।"),
        b("**Days first:** type the days worked in **Days**. The period is set to the whole month by itself. If you change **From Date** or **To Date**, the days are calculated from the dates.", "**पहले दिन:** **Days** में काम के दिन लिखें। समय अपने आप पूरा महीना हो जाता है। अगर **From Date** या **To Date** बदलें तो दिन तारीख़ों से गिन लिए जाते हैं।"),
        b("Days must be at least 1 and not more than the days of the period. Otherwise the form stops you with a message. Untick a person who did not work.", "दिन कम से कम 1 हों और समय के दिनों से ज़्यादा न हों। नहीं तो फ़ॉर्म संदेश के साथ रोक देता है। जिसने काम नहीं किया उस पर से टिक हटा दें।"),
        b("Click **Create Report**, then **Finalize**, print, sign and **Upload Signed Report** exactly as in the regular report. A landscape print is accepted here.", "**Create Report** दबाएँ, फिर **Finalize**, प्रिंट, हस्ताक्षर और **Upload Signed Report** बिल्कुल सामान्य रिपोर्ट की तरह करें। यहाँ चौड़ी (landscape) प्रिंट भी चलती है।"),
      ] },
      { kind: "para", text: b("**Muster Roll:** click **View Draft Report** or **View / Print Final Report** to see the Muster Roll. Use **Print** for paper and **Download Excel** (after finalizing).",
        "**Muster Roll:** Muster Roll देखने के लिए **View Draft Report** या **View / Print Final Report** दबाएँ। काग़ज़ के लिए **Print** और (Finalize के बाद) **Download Excel** है।") },
      { kind: "warn", text: b("**Reminder e-mails:** 5 days before the month ends (if the report is not created), the day before the month ends (if it is not sent), and on the **3rd** of the next month (overdue). They come only while the report is open.",
        "**रिमाइंडर ई-मेल:** महीना ख़त्म होने से 5 दिन पहले (अगर रिपोर्ट बनी नहीं), महीना ख़त्म होने से एक दिन पहले (अगर भेजी नहीं), और अगले महीने की **3 तारीख़** को (देर हो गई)। ये तभी आते हैं जब रिपोर्ट open हो।") },
      { kind: "note", text: b("**Sent on paper?** The section may enter the attendance from your paper copy. Then those employees are marked as already entered and you **cannot add them online again** for that month (you get a message naming the section).",
        "**काग़ज़ पर भेजा?** सेक्शन आपकी काग़ज़ी कॉपी से उपस्थिति खुद दर्ज कर सकता है। तब वे कर्मचारी उस महीने के लिए पहले से दर्ज माने जाते हैं और आप उन्हें **ऑनलाइन दोबारा नहीं जोड़ सकते** (संदेश में सेक्शन का नाम आता है)।") },
      { kind: "para", text: b("**Supplementary report:** if you forgot some staff after sending, ask the Accounts / Bill / Students Section for a one-time permission. Then the button makes a **Supplementary** report for those staff. The permission is used up once the report is created.",
        "**Supplementary रिपोर्ट:** भेजने के बाद कुछ कर्मचारी छूट गए हों तो Accounts / Bill / Students Section से एक बार की अनुमति माँगें। तब बटन उन कर्मचारियों की **Supplementary** रिपोर्ट बनाता है। रिपोर्ट बनते ही अनुमति ख़त्म हो जाती है।") },
      { kind: "tip", text: b("To remove a sent report and make it again, use **Request to Cancel** (see the topic on correcting a report). The same buttons work for this report.",
        "भेजी हुई रिपोर्ट हटाकर फिर बनानी हो तो **Request to Cancel** का उपयोग करें (रिपोर्ट ठीक करना वाला विषय देखें)। इस रिपोर्ट के लिए भी वही बटन हैं।") },
    ],
  },
  {
    id: "report-fix", icon: RotateCcw, group: G_ATT,
    title: b("Correcting a report: revert, cancel, supplementary", "रिपोर्ट सुधारना: Revert, Cancel, Supplementary"),
    summary: b("What to do when something is wrong after finalizing or sending", "Finalize या भेजने के बाद कुछ ग़लत निकले तो क्या करें"),
    blocks: [
      { kind: "terms", items: [
        { term: b("Draft", "Draft"), text: b("Click **Edit** to change, or **Delete** (a box asks to confirm; deleting cannot be undone).", "बदलने के लिए **Edit** दबाएँ, या **Delete** (पुष्टि का बॉक्स आता है; हटाया हुआ वापस नहीं आता)।") },
        { term: b("Submitted (finalized, not uploaded)", "Submitted (Finalize हुई, अपलोड नहीं)"), text: b("Click **Revert to Draft**. A 15-second countdown starts; press **Cancel** to stop it. When it ends the report is a draft again. Edit it, **Finalize** again, and print the new copy (the old Transaction ID no longer works).", "**Revert to Draft** दबाएँ। 15 सेकंड की गिनती चलती है; रोकने के लिए **Cancel** दबाएँ। गिनती पूरी होते ही रिपोर्ट फिर draft हो जाती है। उसे एडिट करें, फिर **Finalize** करें और नई कॉपी प्रिंट करें (पुरानी Transaction ID अब नहीं चलेगी)।") },
        { term: b("Sent", "Sent (भेजी जा चुकी)"), text: b("Click **Request to Cancel**. A 60-second countdown starts; press **ABORT CANCELLATION** to stop it. After it ends the report becomes **cancelled**, its entries are deleted (the signed PDF and receipt number are kept) and Admin is told by e-mail. Now you can create a new report for the month.", "**Request to Cancel** दबाएँ। 60 सेकंड की गिनती चलती है; रोकने के लिए **ABORT CANCELLATION** दबाएँ। गिनती पूरी होने पर रिपोर्ट **cancelled** हो जाती है, उसकी प्रविष्टियाँ मिट जाती हैं (हस्ताक्षरित PDF और रसीद नंबर रहते हैं) और एडमिन को ई-मेल जाता है। अब आप उस महीने की नई रिपोर्ट बना सकते हैं।") },
      ] },
      { kind: "warn", text: b("**Request to Cancel** works only for a report of the present month, and only while your attendance portal is open (the button shows **Cancel N/A** otherwise). Once the 15th has passed, ask Admin to open it for you. Cancelling cannot be undone.",
        "**Request to Cancel** सिर्फ़ मौजूदा महीने की रिपोर्ट के लिए चलता है और तभी जब आपका अटेंडेंस पोर्टल खुला हो (नहीं तो बटन पर **Cancel N/A** लिखा आता है)। 15 के बाद एडमिन से अपने लिए खुलवाएँ। रद्द करना वापस नहीं हो सकता।") },
      { kind: "para", text: b("**Supplementary report** (to add forgotten staff without cancelling the sent report): ask Admin for one-time permission. When it is given, **Create Report** makes a **Supplementary Attendance Report**; put only the missing staff in it. While this permission is on, the sent report cannot be cancelled (**Cancel N/A (Supplementary allowed)**). The permission is used up when the report is created.",
        "**Supplementary रिपोर्ट** (भेजी हुई रिपोर्ट रद्द किए बिना छूटे कर्मचारी जोड़ने के लिए): एडमिन से एक बार की अनुमति माँगें। अनुमति मिलने पर **Create Report** से **Supplementary Attendance Report** बनती है; उसमें सिर्फ़ छूटे कर्मचारी रखें। यह अनुमति चालू रहने तक भेजी हुई रिपोर्ट रद्द नहीं हो सकती (**Cancel N/A (Supplementary allowed)**)। रिपोर्ट बनते ही अनुमति ख़त्म हो जाती है।") },
      { kind: "note", text: b(`For the ${FUND} report the permission comes from the Accounts / Bill / Students Section.`,
        `${FUND} रिपोर्ट के लिए अनुमति Accounts / Bill / Students Section देता है।`) },
    ],
  },
  {
    id: "report-details", icon: Printer, group: G_ATT,
    title: b("Report details and printing", "रिपोर्ट का विवरण और प्रिंट"),
    summary: b("View, print, download a report", "रिपोर्ट देखना, प्रिंट करना, डाउनलोड करना"),
    blocks: [
      { kind: "para", text: b("In the **Actions** column, **View Draft Report** (for a draft) or **View / Print Final Report** (submitted or sent) opens the report page.",
        "**Actions** कॉलम में **View Draft Report** (draft के लिए) या **View / Print Final Report** (submitted या sent के लिए) रिपोर्ट का पेज खोलता है।") },
      { kind: "terms", items: [
        { term: b("Print", "Print"), text: b("Prints the report. For a draft the button says **Draft Report Print** and the print is marked as a draft: do not sign it. If nothing opens, allow pop-ups for the portal.", "रिपोर्ट प्रिंट करता है। draft के लिए बटन **Draft Report Print** है और प्रिंट पर draft का निशान होता है: उस पर हस्ताक्षर न करें। कुछ न खुले तो पोर्टल के लिए pop-up की अनुमति दें।") },
        { term: b("Download Excel", "Download Excel"), text: b("An Excel file of the report (not for a draft).", "रिपोर्ट की Excel फ़ाइल (draft के लिए नहीं)।") },
        { term: b("View PDF", "View PDF"), text: b("Shows the signed copy you uploaded.", "आपकी अपलोड की हुई हस्ताक्षरित कॉपी दिखाता है।") },
        { term: b("Close", "Close"), text: b("Goes back to the list.", "सूची में वापस ले जाता है।") },
      ] },
      { kind: "para", text: b("The page shows the department, month, Status, the D. No. / D. Date boxes, and the table: S.No., Employee ID, Name, Designation, Term Expiry, Reg.No, Period, Days and Remarks. The **Transaction ID** shows as *** on the screen and appears in full on the printed paper.",
        "पेज पर विभाग, महीना, Status, D. No. / D. Date के ख़ाने और तालिका दिखती है: S.No., Employee ID, Name, Designation, Term Expiry, Reg.No, Period, Days और Remarks। **Transaction ID** स्क्रीन पर *** दिखती है और छपे काग़ज़ पर पूरी आती है।") },
      { kind: "note", text: b(`The ${FUND} report opens as the **Muster Roll for Daily Wagers**, grouped by section, with rate, days and amounts. Handwritten corrections on a printed report are not accepted; correct the report in the portal and print again.`,
        `${FUND} रिपोर्ट **Muster Roll for Daily Wagers** के रूप में खुलती है, सेक्शन के हिसाब से, दर, दिन और रक़म के साथ। छपी रिपोर्ट पर हाथ से किए सुधार मान्य नहीं हैं; पोर्टल में सुधारें और फिर प्रिंट करें।`) },
    ],
  },
  {
    id: "attendance-mails", icon: CalendarClock, group: G_ATT,
    title: b("E-mails and reminders you receive", "आपको आने वाले ई-मेल और रिमाइंडर"),
    summary: b("All mails go to the e-mail saved in Settings", "सारे मेल Settings में सेव ई-मेल पर आते हैं"),
    blocks: [
      { kind: "list", items: [
        b("**When something happens:** report created, finalized (action required), sent to the section, cancel or recall done.", "**जब कुछ होता है:** रिपोर्ट बनी, Finalize हुई (कार्रवाई ज़रूरी), सेक्शन को भेजी गई, रद्द या वापस हुई।"),
        b("**10th:** a reminder if you have not created the report.", "**10 तारीख़:** रिपोर्ट नहीं बनी हो तो रिमाइंडर।"),
        b("**14th:** an urgent mail that the deadline is near.", "**14 तारीख़:** डेडलाइन पास होने का ज़रूरी मेल।"),
        b("**2 days after creating** without finalizing, and **2 days after finalizing** without uploading and sending: a reminder each.", "**बनाने के 2 दिन बाद** भी Finalize न हुई, और **Finalize के 2 दिन बाद** भी अपलोड व भेजना न हुआ: हर बार एक रिमाइंडर।"),
        b(`**${FUND} staff:** 5 days before month end, the day before month end, and the 3rd of next month if overdue.`, `**${FUND} स्टाफ:** महीना ख़त्म होने से 5 दिन पहले, एक दिन पहले, और देर हो तो अगले महीने की 3 तारीख़।`),
      ] },
      { kind: "warn", text: b("If a wrong e-mail is saved, the portal shows **Email Not Sent**. Correct it in **Settings** so that you do not miss any reminder.",
        "ग़लत ई-मेल सेव हो तो पोर्टल **Email Not Sent** दिखाता है। कोई रिमाइंडर न छूटे इसलिए **Settings** में उसे ठीक करें।") },
    ],
  },

  // ───────────────────────── Communication ─────────────────────────
  {
    id: "email", icon: Mail, group: G_COMM,
    title: b("Email", "Email"),
    summary: b("Read and send mail inside the portal", "पोर्टल के अंदर मेल पढ़ना और भेजना"),
    blocks: [
      { kind: "para", text: b("Open **Email** in the menu. The left side lists your messages (the number on the menu shows unread mail); click one to read it. You can preview or download attachments, **Forward Email** or **Delete Email**.",
        "मेन्यू में **Email** खोलें। बाईं तरफ़ संदेशों की सूची है (मेन्यू की संख्या बिना पढ़े मेल बताती है); पढ़ने के लिए किसी पर क्लिक करें। अटैचमेंट देख या डाउनलोड कर सकते हैं, **Forward Email** या **Delete Email** कर सकते हैं।") },
      { kind: "steps", items: [
        b("Click the new-message button. The box **New Message** opens.", "नए संदेश का बटन दबाएँ। **New Message** का बॉक्स खुलता है।"),
        b("Search a person or department in the search box, or type the address in **To**.", "खोज बॉक्स में व्यक्ति या विभाग खोजें, या **To** में पता लिखें।"),
        b("Write the **Subject** and the message, attach files if needed, and send.", "**Subject** और संदेश लिखें, ज़रूरत हो तो फ़ाइल जोड़ें और भेजें।"),
      ] },
      { kind: "note", text: b("If the page says no e-mails found or not configured, the mailbox is not set up for your department yet. Raise a **Support Tickets** ticket.",
        "अगर पेज पर लिखा आए कि कोई ई-मेल नहीं मिला या सेट नहीं है, तो आपके विभाग का मेलबॉक्स अभी तैयार नहीं है। **Support Tickets** में टिकट डालें।") },
    ],
  },
  {
    id: "dak", icon: Send, group: G_COMM,
    title: b("Dak Receive/Dispatch", "Dak Receive/Dispatch (डाक)"),
    summary: b("Register letters you receive and send, and track them", "मिले और भेजे पत्रों का रजिस्टर और ट्रैकिंग"),
    blocks: [
      { kind: "para", text: b("Open **Dak Receive/Dispatch**. The cards on top show **Dispatched**, **Received**, **Unreceived (not yet taken in)** and pending work; click a card to filter. The tabs are **Inbox**, **My Dak** (only for staff logins), **Outbox**, **Acknowledged** and **Reports**.",
        "**Dak Receive/Dispatch** खोलें। ऊपर के कार्ड **Dispatched**, **Received**, **Unreceived (not yet taken in)** और बाक़ी काम दिखाते हैं; फ़िल्टर के लिए कार्ड पर क्लिक करें। टैब हैं: **Inbox**, **My Dak** (सिर्फ़ स्टाफ लॉगिन के लिए), **Outbox**, **Acknowledged** और **Reports**।") },
      { kind: "para", text: b("**Send a letter:**", "**पत्र भेजना:**") },
      { kind: "steps", items: [
        b("Click **New Dispatch**. Upload or scan the letter.", "**New Dispatch** दबाएँ। पत्र अपलोड या स्कैन करें।"),
        b("Fill the details (including **Dispatch Number** and **Dispatch Date**). If a scan is read automatically, check what it filled in.", "ब्योरा भरें (**Dispatch Number** और **Dispatch Date** सहित)। स्कैन अपने आप पढ़ा जाए तो जो भरा है उसे जाँच लें।"),
        b("Choose the receiving departments and send. Use **Back** to go to the earlier step.", "पाने वाले विभाग चुनकर भेजें। पिछले स्टेप पर जाने के लिए **Back** दबाएँ।"),
      ] },
      { kind: "para", text: b("**Receive a letter:** open it from **Inbox** and click **Mark Received**; it gets a **Receipt Number (R.No.)**. For a paper letter from outside, click **Receive Entry** and register it. You can **Acknowledge** a letter, print the **Acknowledgement slip**, **Mark to Staff**, **Forward** it, or dispose of it. **Withdraw dispatch** takes back a letter you sent by mistake; **Cancel Entry** strikes off a wrong entry (its R.No. is not used again).",
        "**पत्र लेना:** **Inbox** से पत्र खोलें और **Mark Received** दबाएँ; उसे **Receipt Number (R.No.)** मिलता है। बाहर से आए काग़ज़ी पत्र के लिए **Receive Entry** दबाकर दर्ज करें। आप पत्र को **Acknowledge** कर सकते हैं, **Acknowledgement slip** प्रिंट कर सकते हैं, **Mark to Staff** या **Forward** कर सकते हैं, या निपटा सकते हैं। **Withdraw dispatch** से ग़लती से भेजा पत्र वापस लिया जाता है; **Cancel Entry** ग़लत प्रविष्टि काट देता है (उसका R.No. दोबारा नहीं दिया जाता)।") },
    ],
  },
  {
    id: "efiles", icon: FolderOpen, group: G_COMM,
    title: b("E-Files", "E-Files (ई-फ़ाइल)"),
    summary: b("File noting, movement and letters without paper", "बिना काग़ज़ के फ़ाइल नोटिंग, चाल और पत्र"),
    blocks: [
      { kind: "para", text: b("**E-Files** keeps noting, file movement, correspondence and approved letters in one place. Search by file number or subject. The tabs **Open**, **Closed**, **Due for review**, **Record room**, **Weeded** and **All** filter the list.",
        "**E-Files** में नोटिंग, फ़ाइल की चाल, पत्राचार और स्वीकृत पत्र एक जगह रहते हैं। फ़ाइल नंबर या विषय से खोजें। **Open**, **Closed**, **Due for review**, **Record room**, **Weeded** और **All** टैब सूची छाँटते हैं।") },
      { kind: "steps", items: [
        b("Open a new file: fill **File number**, **Subject** and **Record category**.", "नई फ़ाइल खोलें: **File number**, **Subject** और **Record category** भरें।"),
        b("Inside the file write the next para with **Add note**. **Print noting** prints the notes.", "फ़ाइल के अंदर **Add note** से अगला पैरा लिखें। **Print noting** से नोटिंग प्रिंट होती है।"),
        b("Put a dak paper on the file by typing its R.No. or Outward No. and clicking **Place**.", "R.No. या Outward No. लिखकर **Place** दबाने से कोई डाक फ़ाइल पर लग जाती है।"),
        b("Pass the file on with **Send / put up** (choose a staff login and remarks).", "**Send / put up** से फ़ाइल आगे भेजें (स्टाफ लॉगिन और remarks चुनें)।"),
        b("For a letter, make a draft; once it is approved, use **Issue letter**. The letter PDF gets an outward number, date and QR verification stamp.", "पत्र के लिए ड्राफ़्ट बनाएँ; स्वीकृत होने पर **Issue letter** करें। पत्र के PDF पर आउटवर्ड नंबर, तारीख़ और QR सत्यापन मुहर लगती है।"),
      ] },
      { kind: "note", text: b("Staff logins must exist first (see **Staff Logins**). Closing, reopening, moving to the record room, keeping longer and weeding out are done by the HOD or Section Officer.",
        "पहले स्टाफ लॉगिन बने होने चाहिए (**Staff Logins** देखें)। फ़ाइल बंद करना, फिर खोलना, रिकॉर्ड रूम भेजना, ज़्यादा समय रखना और Weed out HOD या Section Officer करते हैं।") },
    ],
  },
  {
    id: "claims", icon: FileSignature, group: G_COMM,
    title: b("Claim Forms", "Claim Forms (दावा फ़ॉर्म)"),
    summary: b("NPA, HRA, PCA, Conveyance Allowance and CEA filled by employees", "कर्मचारियों के भरे NPA, HRA, PCA, Conveyance Allowance और CEA"),
    blocks: [
      { kind: "para", text: b("**Claim Forms** shows in the menu only while the forms are open (or when some form is waiting). Employees fill the form online from the login page (they need only the Permanent ID Number and date of joining). Then it comes to your department.",
        "**Claim Forms** मेन्यू में तभी दिखता है जब फ़ॉर्म खुले हों (या कोई फ़ॉर्म इंतज़ार में हो)। कर्मचारी लॉगिन पेज से ऑनलाइन फ़ॉर्म भरते हैं (सिर्फ़ Permanent ID Number और जॉइनिंग की तारीख़ चाहिए)। फिर वह आपके विभाग में आता है।") },
      { kind: "terms", items: [
        { term: b("Waiting for signed form", "Waiting for signed form"), text: b("New forms. Your work is here.", "नए फ़ॉर्म। आपका काम यहाँ है।") },
        { term: b("Sent to Salary Section", "Sent to Salary Section"), text: b("You uploaded the signed form.", "आपने हस्ताक्षरित फ़ॉर्म अपलोड कर दिया।") },
        { term: b("Processed", "Processed"), text: b("The Salary Section finished it.", "Salary Section ने काम पूरा किया।") },
        { term: b("Returned / closed", "Returned / closed"), text: b("Returned to the employee, rejected or cancelled.", "कर्मचारी को लौटाया, अस्वीकृत या रद्द।") },
      ] },
      { kind: "steps", items: [
        b("Open the form from **Waiting for signed form** and click **Print form**.", "**Waiting for signed form** से फ़ॉर्म खोलें और **Print form** दबाएँ।"),
        b("Get it signed by the employee and by the Chairman / Head with seal. Write the dispatch number and date on it.", "कर्मचारी और Chairman / Head से मुहर के साथ हस्ताक्षर कराएँ। उस पर Despatch नंबर और तारीख़ लिखें।"),
        b("Fill **Dispatch number (D. No.)** and **Dispatch date (D. Date)**, click **Choose scan** and upload. If the portal asks, confirm with **Yes, this is the correct form — upload**.", "**Dispatch number (D. No.)** और **Dispatch date (D. Date)** भरें, **Choose scan** दबाकर अपलोड करें। पोर्टल पूछे तो **Yes, this is the correct form — upload** से पक्का करें।"),
      ] },
      { kind: "tip", text: b("If the form itself is wrong, use **Return to employee** and write why. The employee corrects the form and prints and signs it again. If the Salary Section returns a form with an objection, you see it on the form: upload the corrected signed copy.",
        "फ़ॉर्म ही ग़लत हो तो **Return to employee** दबाकर कारण लिखें। कर्मचारी फ़ॉर्म सुधारकर फिर प्रिंट और हस्ताक्षर करता है। Salary Section आपत्ति के साथ फ़ॉर्म लौटाए तो वह फ़ॉर्म पर दिखती है: सुधारी हुई हस्ताक्षरित कॉपी अपलोड करें।") },
    ],
  },
  {
    id: "docs", icon: FileImage, group: G_COMM,
    title: b("Document Gallery and Useful Downloads", "Document Gallery और Useful Downloads"),
    summary: b("Keep office papers as pictures; download forms and circulars", "दफ़्तर के काग़ज़ तस्वीर में रखें; फ़ॉर्म और परिपत्र डाउनलोड करें"),
    blocks: [
      { kind: "para", text: b("**Document Gallery** stores pictures of your office memos, orders and circulars. Search by words or filter by date (**From**, **To**).",
        "**Document Gallery** में आपके office memo, order और circular की तस्वीरें रहती हैं। शब्द से खोजें या तारीख़ (**From**, **To**) से छाँटें।") },
      { kind: "steps", items: [
        b("Click **Upload Document**.", "**Upload Document** दबाएँ।"),
        b("Add the **Document Image** (JPEG, JPG or PNG, under 5 MB).", "**Document Image** जोड़ें (JPEG, JPG या PNG, 5 MB से कम)।"),
        b("Choose **Document Type** (Office Memo, Office Order, Circular / Notice or Other) and fill **Issuing Authority**, **Subject**, **Ref. No.** (digits only) and **Dispatch Date**.", "**Document Type** चुनें (Office Memo, Office Order, Circular / Notice या Other) और **Issuing Authority**, **Subject**, **Ref. No.** (सिर्फ़ अंक) और **Dispatch Date** भरें।"),
      ] },
      { kind: "para", text: b("**Useful Downloads** lists the files the university put for you (forms, formats, circulars). Click an item to open or download it. You cannot add files here.",
        "**Useful Downloads** में विश्वविद्यालय की रखी फ़ाइलें (फ़ॉर्म, प्रारूप, परिपत्र) हैं। खोलने या डाउनलोड करने के लिए किसी पर क्लिक करें। यहाँ आप फ़ाइल नहीं जोड़ सकते।") },
    ],
  },

  // ───────────────────────── Account and help ─────────────────────────
  {
    id: "tickets", icon: Ticket, group: G_ACC,
    title: b("Support Tickets", "Support Tickets (सहायता टिकट)"),
    summary: b("Ask Admin for help or a correction", "मदद या सुधार के लिए एडमिन से कहें"),
    blocks: [
      { kind: "steps", items: [
        b("Open **Support Tickets** and click to create a ticket (**Create Support Ticket**).", "**Support Tickets** खोलें और टिकट बनाने के लिए क्लिक करें (**Create Support Ticket**)।"),
        b("Write the **Subject** and the **Description** (both required). Choose a **Priority**.", "**Subject** और **Description** लिखें (दोनों ज़रूरी)। **Priority** चुनें।"),
        b("Add a **Screenshot** (JPEG or PNG) if it helps. Save the ticket.", "काम आए तो **Screenshot** (JPEG या PNG) जोड़ें। टिकट सेव करें।"),
      ] },
      { kind: "para", text: b("Admin answers appear on the ticket as **Admin Response**. The status goes Open, In Progress, Resolved, Closed. Use a ticket to ask Admin to change an employee's name, designation, salary register number or salary assistant.",
        "एडमिन का जवाब टिकट पर **Admin Response** के रूप में आता है। स्थिति Open, In Progress, Resolved, Closed बदलती है। कर्मचारी का नाम, पद, salary register number या salary assistant बदलवाने के लिए टिकट डालें।") },
    ],
  },
  {
    id: "staff-logins", icon: UserCog, group: G_ACC,
    title: b("Staff Logins", "Staff Logins (स्टाफ के लॉगिन)"),
    summary: b("Own login for each person, for Dak and E-Files", "हर व्यक्ति का अपना लॉगिन, Dak और E-Files के लिए"),
    blocks: [
      { kind: "para", text: b("**Staff Logins** is shown only to the department login, the HOD and the Section Officer. Each staff member gets an own login, and Dak and E-File actions are recorded under that name. The roles are **HOD**, **Section Officer**, **Dealing Assistant** and **Diary Clerk**.",
        "**Staff Logins** सिर्फ़ विभाग के लॉगिन, HOD और Section Officer को दिखता है। हर स्टाफ को अपना लॉगिन मिलता है और Dak व E-File की कार्रवाई उसी के नाम से दर्ज होती है। भूमिकाएँ हैं: **HOD**, **Section Officer**, **Dealing Assistant** और **Diary Clerk**।") },
      { kind: "steps", items: [
        b("Click **Add Staff Login**.", "**Add Staff Login** दबाएँ।"),
        b("Fill **Name**, **Role**, Designation, the login e-mail, a password, and the mobile number for alerts. You may link an employee record.", "**Name**, **Role**, Designation, लॉगिन ई-मेल, पासवर्ड और अलर्ट के लिए मोबाइल नंबर भरें। चाहें तो कर्मचारी का रिकॉर्ड जोड़ें।"),
        b("Staff log in on the normal login page with their own e-mail. Use the **Active** switch to stop a login at once. **Edit** changes details. **Change my password** changes your own password.", "स्टाफ सामान्य लॉगिन पेज पर अपने ई-मेल से लॉगिन करते हैं। लॉगिन तुरंत बंद करने के लिए **Active** स्विच इस्तेमाल करें। **Edit** से जानकारी बदलती है। **Change my password** से अपना पासवर्ड बदलें।"),
      ] },
    ],
  },
  {
    id: "settings", icon: Settings, group: G_ACC,
    title: b("Settings", "Settings (सेटिंग)"),
    summary: b("Profile, password and installing the app", "प्रोफ़ाइल, पासवर्ड और ऐप इंस्टॉल"),
    blocks: [
      { kind: "list", items: [
        b("**Profile** tab: **HOD Title**, **HOD Name** and **Email**, then **Update Profile**. The HOD title and name are printed on your reports and transfer papers, so keep them current.", "**Profile** टैब: **HOD Title**, **HOD Name** और **Email**, फिर **Update Profile**। HOD का पद और नाम आपकी रिपोर्ट और ट्रांसफ़र काग़ज़ात पर छपता है, इसलिए इन्हें ताज़ा रखें।"),
        b("**Password** tab: **Current Password**, **New Password** (at least 8 characters), **Confirm Password**, then **Change Password**.", "**Password** टैब: **Current Password**, **New Password** (कम से कम 8 अक्षर), **Confirm Password**, फिर **Change Password**।"),
        b("A card on this page lets you install the portal as an app on your phone or computer.", "इस पेज पर एक कार्ड है जिससे पोर्टल को फ़ोन या कंप्यूटर में ऐप की तरह इंस्टॉल कर सकते हैं।"),
      ] },
    ],
  },
  {
    id: "ai-notices", icon: Bot, group: G_ACC,
    title: b("AMU AI assistant and Notices", "AMU AI सहायक और Notices"),
    summary: b("Ask questions in the chat; read university notices", "चैट में सवाल पूछें; विश्वविद्यालय के नोटिस पढ़ें"),
    blocks: [
      { kind: "para", text: b("**AMU AI:** below **Help** in the left menu is the round **AMU AI** button. Click it, a chat window opens, and you can ask your question in words. It also opens from the login page.",
        "**AMU AI:** बाएँ मेन्यू में **Help** के नीचे गोल **AMU AI** बटन है। उस पर क्लिक करें, चैट विंडो खुलेगी और आप अपना सवाल शब्दों में पूछ सकते हैं। यह लॉगिन पेज से भी खुलता है।") },
      { kind: "para", text: b("**Notices:** notices sent by Admin show at the bottom of the left menu with a megaphone icon (last 5). Click one to read the full text and see the picture, if any. New notices also reach you through the bell.",
        "**Notices:** एडमिन के भेजे नोटिस बाएँ मेन्यू में नीचे भोंपू के निशान के साथ दिखते हैं (आख़िरी 5)। पूरा पाठ और (अगर हो तो) तस्वीर देखने के लिए क्लिक करें। नए नोटिस घंटी में भी आते हैं।") },
    ],
  },

  // ───────────────────────── Questions ─────────────────────────
  {
    id: "faq", icon: HelpCircle, group: b("Questions", "सवाल-जवाब"),
    title: b("Questions and answers", "सवाल-जवाब"),
    summary: b("Common problems and what to do", "आम समस्याएँ और उनका हल"),
    blocks: [
      { kind: "faq", items: [
        { q: b("I missed the 15th. Can I still send the attendance?", "मुझसे 15 तारीख़ छूट गई। क्या अब भी अटेंडेंस भेज सकता हूँ?"),
          a: b("The **Create Report** button is off after the 15th. The portal reopens on the **20th** (or the next working day if it is a Sunday or holiday) for a few hours; create and send the report in that time. Watch the e-mail and the dashboard pop-up. Otherwise ask Admin to give your department permission.",
               "15 के बाद **Create Report** बटन बंद रहता है। पोर्टल **20 तारीख़** को (रविवार या छुट्टी हो तो अगले कार्य-दिवस पर) कुछ घंटे के लिए फिर खुलता है; उसी समय रिपोर्ट बनाकर भेजें। ई-मेल और डैशबोर्ड का पॉप-अप देखते रहें। नहीं तो एडमिन से अपने विभाग को अनुमति देने को कहें।") },
        { q: b("Upload says the copy does not match (**This does not appear to be the latest signed copy** or **ID Mismatch**).", "अपलोड में लिखा आता है कि कॉपी मेल नहीं खाती (**This does not appear to be the latest signed copy** या **ID Mismatch**)।"),
          a: b("Every time you **Finalize**, a new Transaction ID is made. Your paper has an older ID. Open **View / Print Final Report**, print it again, get it signed and upload that copy. If the portal could not read the ID, type the ID printed on the paper in **Verify Transaction ID** (8 letters or digits).",
               "हर बार **Finalize** करने पर नई Transaction ID बनती है। आपके काग़ज़ पर पुरानी ID है। **View / Print Final Report** खोलकर फिर प्रिंट करें, हस्ताक्षर कराएँ और वही कॉपी अपलोड करें। पोर्टल ID न पढ़ सका हो तो काग़ज़ पर छपी ID **Verify Transaction ID** में लिखें (8 अक्षर या अंक)।") },
        { q: b("**Document Quality Check Failed**. What now?", "**Document Quality Check Failed** आया। अब क्या करें?"),
          a: b("The scan is blurry, too dark, too small, blank or sideways (the regular report must be upright; the Muster Roll can be landscape). Scan again in good light, flat, at a clear resolution, or use **Take Photo**. Image up to 2 MB, PDF up to 5 MB.",
               "स्कैन धुँधला, बहुत अँधेरा, बहुत छोटा, ख़ाली या टेढ़ा है (सामान्य रिपोर्ट सीधी होनी चाहिए; Muster Roll चौड़ी हो सकती है)। अच्छी रोशनी में, सीधा रखकर, साफ़ रिज़ॉल्यूशन में फिर स्कैन करें, या **Take Photo** इस्तेमाल करें। फ़ोटो 2 MB तक, PDF 5 MB तक।") },
        { q: b("An employee was transferred in the middle of the month.", "महीने के बीच में कर्मचारी का ट्रांसफ़र हो गया।"),
          a: b("Put only the days up to the relieving date in your report (change **To Date**), and the new department sends the days after that. The portal stops you if the same days were already sent for that person in another report. A transfer cannot be made when a full-month attendance of this month is already created or sent for the person.",
               "अपनी रिपोर्ट में सिर्फ़ कार्यमुक्ति (relieving) की तारीख़ तक के दिन रखें (**To Date** बदलें), उसके बाद के दिन नया विभाग भेजेगा। उसी व्यक्ति के वही दिन किसी दूसरी रिपोर्ट में पहले भेजे जा चुके हों तो पोर्टल रोक देता है। जिस व्यक्ति की इस महीने की पूरे महीने की अटेंडेंस बन या भेजी जा चुकी हो उसका ट्रांसफ़र नहीं हो सकता।") },
        { q: b("My wage staff are missing from the regular report.", "मेरे वेतन-फंड स्टाफ सामान्य रिपोर्ट में नहीं दिख रहे।"),
          a: b(`Staff whose Employee ID starts with a letter go only in the separate **${FUND}** report (button **Create ${FUND} Report**), and they never appear in the regular report. If you try to add them to the wrong report the portal tells you which report to use.`,
               `जिनका Employee ID अक्षर से शुरू होता है वे सिर्फ़ अलग **${FUND}** रिपोर्ट में जाते हैं (बटन **Create ${FUND} Report**), सामान्य रिपोर्ट में कभी नहीं आते। ग़लत रिपोर्ट में जोड़ने की कोशिश करें तो पोर्टल बताता है कि कौन सी रिपोर्ट इस्तेमाल करनी है।`) },
        { q: b(`The **Create ${FUND} Report** button is off.`, `**Create ${FUND} Report** बटन बंद है।`),
          a: b("Either a draft of that report already exists (finalize or delete it), the report for this month already exists, or the sections have not opened it yet. It opens near the end of the month. It can be sent only while it is **Open**. For a second report in the same month you need the section's supplementary permission.",
               "या तो उस रिपोर्ट का draft पहले से है (उसे Finalize या Delete करें), इस महीने की रिपोर्ट बन चुकी है, या सेक्शनों ने उसे अभी खोला नहीं है। यह महीने के अंत के पास खुलती है। यह सिर्फ़ **Open** रहने पर भेजी जा सकती है। उसी महीने की दूसरी रिपोर्ट के लिए सेक्शन की supplementary अनुमति चाहिए।") },
        { q: b("The portal says the attendance of a wage employee was already entered by a section.", "पोर्टल कहता है कि वेतन-फंड कर्मचारी की उपस्थिति सेक्शन पहले ही दर्ज कर चुका है।"),
          a: b("You sent a paper copy and the section entered it. Those employees cannot be added online again for that month. Add only the others, or ask the section.",
               "आपने काग़ज़ी कॉपी भेजी थी और सेक्शन ने उसे दर्ज कर लिया। उस महीने के लिए उन कर्मचारियों को ऑनलाइन दोबारा नहीं जोड़ा जा सकता। बाक़ी कर्मचारी ही जोड़ें, या सेक्शन से पूछें।") },
        { q: b("How do I correct a report I have already sent?", "भेजी हुई रिपोर्ट कैसे सुधारूँ?"),
          a: b("Same month and portal open: **Request to Cancel** (60-second countdown), then create the report again. Forgot only a few staff: ask for the one-time **Supplementary** permission. Finalized but not uploaded: **Revert to Draft**. After the 15th, ask Admin to open your portal first.",
               "उसी महीने में और पोर्टल खुला हो: **Request to Cancel** (60 सेकंड की गिनती), फिर रिपोर्ट दोबारा बनाएँ। सिर्फ़ कुछ कर्मचारी छूटे: एक बार की **Supplementary** अनुमति माँगें। Finalize हुई पर अपलोड नहीं: **Revert to Draft**। 15 के बाद पहले एडमिन से पोर्टल खुलवाएँ।") },
        { q: b("I cannot disable an employee.", "मैं कर्मचारी को Disable नहीं कर पा रहा।"),
          a: b("The employee is in this month's attendance report (**Cannot Disable Employee**). Cancel or recall that report first, or ask Admin.",
               "कर्मचारी इस महीने की अटेंडेंस रिपोर्ट में है (**Cannot Disable Employee**)। पहले वह रिपोर्ट रद्द करें या वापस लें, या एडमिन से कहें।") },
        { q: b("I need to change an employee's name, designation or salary assistant.", "मुझे कर्मचारी का नाम, पद या salary assistant बदलना है।"),
          a: b("Only Admin can change these. Raise a ticket in **Support Tickets** with the correct details.",
               "इन्हें सिर्फ़ एडमिन बदल सकता है। सही जानकारी के साथ **Support Tickets** में टिकट डालें।") },
        { q: b("I forgot my password or my login is locked.", "मैं पासवर्ड भूल गया या मेरा लॉगिन बंद हो गया।"),
          a: b("Click **Forgot Password?** on the login page and use the link that comes to your e-mail within 1 hour. If the login is locked after wrong tries, wait for the minutes shown and try again.",
               "लॉगिन पेज पर **Forgot Password?** दबाएँ और ई-मेल पर आया लिंक 1 घंटे के अंदर इस्तेमाल करें। ग़लत कोशिशों से लॉगिन बंद हो तो दिखाए गए मिनट रुककर फिर कोशिश करें।") },
        { q: b("A wage employee cannot see the pay slip.", "वेतन-फंड कर्मचारी को पे-स्लिप नहीं दिख रही।"),
          a: b("The month appears only after the section has paid the wages and released the pay slips. Check that the **Employee ID** is right and that the **Date of joining** or the full **Bank account number** matches the record. If the details are wrong, correct them in **Employees** or ask Admin.",
               "महीना तभी दिखता है जब सेक्शन वेतन दे चुका हो और पे-स्लिप जारी कर दी हों। **Employee ID** सही हो और **Date of joining** या पूरा **Bank account number** रिकॉर्ड से मेल खाता हो, यह देखें। जानकारी ग़लत हो तो **Employees** में सुधारें या एडमिन से कहें।") },
        { q: b("The employee I need is in another department.", "जिस कर्मचारी की मुझे ज़रूरत है वह दूसरे विभाग में है।"),
          a: b("Use **Global Search** and click **Request Release**. The other department must approve. For an inactive employee use **Pull Employee**.",
               "**Global Search** में जाकर **Request Release** दबाएँ। दूसरे विभाग को मंज़ूर करना होगा। Inactive कर्मचारी के लिए **Pull Employee** है।") },
      ] },
    ],
  },
];

export default function Help() {
  return (
    <div className="flex min-h-screen">
      <Sidebar className="w-64 border-r" />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 p-4 sm:p-6">
          <HelpGuide
            title={b("Department User Guide", "विभाग उपयोगकर्ता गाइड")}
            badge={b("Department", "विभाग")}
            intro={b(
              "How to use the AMU attendance portal for your department: staff, monthly attendance, wage staff, letters and files. Choose English or Hindi at the top right.",
              "अपने विभाग के लिए AMU अटेंडेंस पोर्टल कैसे चलाएँ: कर्मचारी, मासिक उपस्थिति, वेतन-फंड स्टाफ, पत्र और फ़ाइलें। ऊपर दाईं तरफ़ से English या हिंदी चुनें।")}
            quickStart={quickStart}
            topics={topics}
          />
        </main>
      </div>
    </div>
  );
}
