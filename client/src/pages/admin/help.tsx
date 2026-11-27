// In-app user guide for admin logins: Salary Section, Super Admin and the Accounts / Bill / Students
// section logins. Content is plain data (English + easy Hindi) shown by the shared HelpGuide.
// Button and menu names are kept exactly as they appear in the app (English, in bold).
import { useState } from "react";
import {
  AlertTriangle, ArrowRightLeft, BookOpen, Building2, CalendarClock, FileSignature, FileText, FileSpreadsheet,
  HelpCircle, History, Landmark, LayoutDashboard, Mail, Megaphone, Phone, Rocket, ScrollText, Send, Settings,
  Ticket, UserCog, Users, UserX, Wallet, ReceiptText, ClipboardCheck, FileImage, Scale, ShieldCheck,
} from "lucide-react";
import AdminHeader from "@/components/layout/admin-header";
import { HelpGuide, type Bi, type HelpTopic } from "@/components/help/help-kit";
import { getAdminAccess, isSectionLogin, useAdminSection } from "@/lib/admin-access";
import { sectionLabel } from "@shared/sections";
import { cn } from "@/lib/utils";

const t = (en: string, hi: string): Bi => ({ en, hi });

// ───────────────────────── SALARY SECTION GUIDE ─────────────────────────

function salaryTopics(isSuper: boolean): HelpTopic[] {
  const G_START = t("Getting started", "शुरुआत");
  const G_DAILY = t("Daily work", "रोज़ का काम");
  const G_STAFF = t("Employees", "कर्मचारी");
  const G_TALK = t("Mail & documents", "मेल और दस्तावेज़");
  const G_OTHER = t("Other work", "दूसरे काम");
  const G_ADMIN = t("Super Admin", "सुपर एडमिन");
  const G_HELP = t("Help", "मदद");

  const topics: HelpTopic[] = [
    {
      id: "menu", icon: LayoutDashboard, group: G_START,
      title: t("Menu, dark mode and logout", "मेन्यू, डार्क मोड और लॉगआउट"),
      summary: t("How to move around the admin area.", "एडमिन पेज पर एक जगह से दूसरी जगह कैसे जाएँ।"),
      blocks: [
        { kind: "para", text: t(
          "The menu at the top has: **Dashboard**, **Detailed View**, **Employees**, **Email**, **Documents**, **LPC**, **Dak**, **Claim Forms**, **Tickets**, **Notices**, **Contacts**. The Super Admin also sees **Users** and **Settings**. What you see depends on your login.",
          "ऊपर के मेन्यू में ये बटन होते हैं: **Dashboard**, **Detailed View**, **Employees**, **Email**, **Documents**, **LPC**, **Dak**, **Claim Forms**, **Tickets**, **Notices**, **Contacts**। सुपर एडमिन को **Users** और **Settings** भी दिखते हैं। आपको कौन-से बटन दिखेंगे, यह आपके लॉगिन पर निर्भर है।") },
        { kind: "list", items: [
          t("On a phone, tap **Menu** to open the full list.", "फ़ोन पर पूरी सूची के लिए **Menu** दबाएँ।"),
          t("The sun / moon button switches dark mode on and off.", "सूरज / चाँद वाला बटन डार्क मोड चालू-बंद करता है।"),
          t("Press **Logout** when you finish, especially on a shared computer.", "काम खत्म होने पर **Logout** दबाएँ, खासकर साझा कंप्यूटर पर।"),
          t("Click the AMU logo or **Dashboard** to come back to the first page.", "पहले पेज पर लौटने के लिए लोगो या **Dashboard** दबाएँ।"),
        ] },
        { kind: "tip", text: t("The language switch above works for this guide only. It is remembered in this browser.", "ऊपर का भाषा बटन सिर्फ़ इस गाइड के लिए है। यह इस ब्राउज़र में याद रहता है।") },
      ],
    },
    {
      id: "dashboard", icon: LayoutDashboard, group: G_DAILY,
      title: t("Dashboard", "डैशबोर्ड"),
      summary: t("See which departments have sent attendance this month.", "इस महीने किन विभागों ने हाज़िरी भेजी, यहाँ दिखता है।"),
      blocks: [
        { kind: "para", text: t(
          "The **Dashboard** shows every attendance report for the month you choose. At the top there are boxes with numbers.",
          "**Dashboard** में चुने हुए महीने की सभी हाज़िरी रिपोर्ट दिखती हैं। ऊपर कुछ डिब्बों में गिनती दिखती है।") },
        { kind: "terms", items: [
          { term: t("Received", "Received"), text: t("Departments that have sent their report.", "जिन विभागों की रिपोर्ट आ गई है।") },
          { term: t("Processed", "Processed"), text: t("Reports you have already dealt with.", "जिन रिपोर्ट पर आप काम कर चुके हैं।") },
          { term: t("Missing", "Missing"), text: t("Departments whose report has not come. Click to see the names.", "जिन विभागों की रिपोर्ट नहीं आई। नाम देखने के लिए दबाएँ।") },
          { term: t("Status Breakdown", "Status Breakdown"), text: t("Reports by status: **Submitted**, **Draft**, **Cancelled**, **Not Processed**.", "रिपोर्ट की स्थिति के हिसाब से गिनती: **Submitted**, **Draft**, **Cancelled**, **Not Processed**।") },
          { term: t("Transfer Requests", "Transfer Requests"), text: t("Counts of pending **Transfers**, **Releases**, **Done**, and employees **Reporting** at another department. Click the arrow to open the full list.", "बाकी **Transfers**, **Releases**, **Done** की गिनती और दूसरे विभाग में **Reporting** करने वाले कर्मचारी। पूरी सूची के लिए तीर दबाएँ।") },
        ] },
        { kind: "steps", items: [
          t("Pick the month in the month filter (or leave **All Months**).", "महीने का फ़िल्टर चुनें (या **All Months** रहने दें)।"),
          t("Use the search box or the department / status filters to find a report.", "रिपोर्ट खोजने के लिए सर्च बॉक्स या विभाग / स्थिति के फ़िल्टर इस्तेमाल करें।"),
          t("Use the buttons at the end of each row (see the next topic).", "हर पंक्ति के आखिर के बटन इस्तेमाल करें (अगला विषय देखें)।"),
          t("**Download Excel** saves the list you see.", "**Download Excel** आपकी दिख रही सूची को सेव करता है।"),
        ] },
        { kind: "note", text: t("When attendance data of a month has been sent to the payroll database, a popup shows the date and time and the number of records. Press **OK, Got it** to close it.", "जब किसी महीने की हाज़िरी पेरोल डेटाबेस को भेजी जा चुकी होती है, तो एक पॉपअप तारीख, समय और रिकॉर्ड की संख्या बताता है। बंद करने के लिए **OK, Got it** दबाएँ।") },
      ],
    },
    {
      id: "report-actions", icon: ClipboardCheck, group: G_DAILY,
      title: t("Working on a report", "रिपोर्ट पर काम"),
      summary: t("View, accept cancellation, revert, allow supplementary.", "देखना, रद्द करना मंज़ूर करना, वापस ड्राफ्ट करना, सप्लीमेंट्री की अनुमति।"),
      blocks: [
        { kind: "para", text: t("Each row of the **Dashboard** has these buttons (only the ones that fit the report are shown):", "**Dashboard** की हर पंक्ति में ये बटन होते हैं (रिपोर्ट के हिसाब से कुछ ही दिखते हैं):") },
        { kind: "terms", items: [
          { term: t("View PDF", "View PDF"), text: t("Shows the report as a PDF.", "रिपोर्ट को PDF में दिखाता है।") },
          { term: t("View Details", "View Details"), text: t("Opens the full report with all employees and days. You can print it from there.", "पूरी रिपोर्ट खोलता है, सभी कर्मचारी और दिन के साथ। वहीं से प्रिंट कर सकते हैं।") },
          { term: t("Accept Cancel", "Accept Cancel"), text: t("A department asked to cancel its report. Press this to accept. The department can then send a new one.", "विभाग ने अपनी रिपोर्ट रद्द करने को कहा है। मंज़ूर करने के लिए दबाएँ। फिर विभाग नई रिपोर्ट भेज सकता है।") },
          { term: t("Approve Recall", "Approve Recall"), text: t("A department asked to take its report back to draft. Press to approve.", "विभाग रिपोर्ट को वापस ड्राफ्ट में लाना चाहता है। मंज़ूरी के लिए दबाएँ।") },
          { term: t("Revert Draft", "Revert Draft"), text: t("Super Admin only. Sends a submitted report back to draft.", "सिर्फ़ सुपर एडमिन। भेजी हुई रिपोर्ट को वापस ड्राफ्ट करता है।") },
          { term: t("Allow supplementary", "Allow supplementary"), text: t("A switch for Revolving Funds or Other Similar Funds staff. Turn it on so that the department can send one more report for the same month.", "रिवॉल्विंग फंड वाले स्टाफ़ के लिए स्विच। इसे चालू करें तो विभाग उसी महीने की एक और रिपोर्ट भेज सकता है।") },
        ] },
        { kind: "warn", text: t("The red trash button (Super Admin only) deletes a report and asks you twice. Use it only for a mistake.", "लाल कूड़ेदान बटन (सिर्फ़ सुपर एडमिन) रिपोर्ट मिटाता है और दो बार पूछता है। सिर्फ़ गलती सुधारने के लिए इस्तेमाल करें।") },
        { kind: "para", text: t("Inside **View Details** you can correct the type of the report with **Mark as Supplementary** or **Mark as Main Report**. A Super Admin can also edit the report (**Edit Attendance Report**) and save it.", "**View Details** के अंदर **Mark as Supplementary** या **Mark as Main Report** से रिपोर्ट का प्रकार ठीक कर सकते हैं। सुपर एडमिन रिपोर्ट को बदलकर (**Edit Attendance Report**) सेव भी कर सकता है।") },
      ],
    },
    {
      id: "detailed", icon: FileSpreadsheet, group: G_DAILY,
      title: t("Detailed View", "Detailed View (विस्तृत देखें)"),
      summary: t("Check every employee entry, add notes, and send data to the payroll database.", "हर कर्मचारी की एंट्री जाँचें, नोट लिखें और पेरोल डेटाबेस के लिए डेटा भेजें।"),
      blocks: [
        { kind: "para", text: t("**Detailed View** lists every attendance entry, one row per employee. It is your main working page for the month.", "**Detailed View** में हर कर्मचारी की हाज़िरी एंट्री की सूची है, एक कर्मचारी की एक पंक्ति। महीने का आपका मुख्य काम यहीं होता है।") },
        { kind: "steps", items: [
          t("Choose the month, and filter by department, designation, dealing assistant or register if you need.", "महीना चुनें, ज़रूरत हो तो विभाग, पद, डीलिंग असिस्टेंट या रजिस्टर से फ़िल्टर करें।"),
          t("Check the days and the **Remarks** of each employee. Use **Noting** to write your own note (type it in the **Add note...** box).", "हर कर्मचारी के दिन और **Remarks** जाँचें। अपना नोट **Noting** में लिखें (**Add note...** वाले बॉक्स में)।"),
          t("Tick **Verified** when the entry is checked. You can filter by **Verified** or **Pending Verification**.", "एंट्री जाँच लेने पर **Verified** पर टिक लगाएँ। **Verified** या **Pending Verification** से फ़िल्टर कर सकते हैं।"),
          t("Use the **Export** menu: **Export as Excel (.xls)** or **Export as CSV** gives the file for the payroll database.", "**Export** मेन्यू इस्तेमाल करें: **Export as Excel (.xls)** या **Export as CSV** से पेरोल डेटाबेस की फ़ाइल मिलती है।"),
          t("After the file is used, mark the entries as exported (tick the box in the **Export** column). The date is saved. Click a date to change it.", "फ़ाइल इस्तेमाल हो जाने पर एंट्री को exported मार्क करें (**Export** कॉलम का डिब्बा टिक करें)। तारीख सेव हो जाती है। बदलने के लिए तारीख पर दबाएँ।"),
          t("**Download Excel** saves the list as you see it on the screen.", "**Download Excel** आपकी स्क्रीन की सूची को सेव करता है।"),
        ] },
        { kind: "tip", text: t("Tick **Skip Already Exported** so that a second export does not include rows that were already sent. **Reset / Update Export Date** (in the **Export** menu) changes the date for many rows together.", "**Skip Already Exported** पर टिक करें ताकि दोबारा एक्सपोर्ट में पुरानी पंक्तियाँ न जाएँ। **Reset / Update Export Date** (**Export** मेन्यू में) कई पंक्तियों की तारीख एक साथ बदलता है।") },
        { kind: "list", items: [
          t("The eye button opens **View Report Details**. The paper icons show the signed report.", "आँख वाला बटन रिपोर्ट की जानकारी खोलता है। कागज़ वाला निशान हस्ताक्षर की हुई रिपोर्ट दिखाता है।"),
          t("**Accept Cancellation** appears at the top when departments have asked to cancel.", "जब विभाग रद्द करने को कहते हैं, तब ऊपर **Accept Cancellation** दिखता है।"),
          t("The arrows on the register filter go to the previous / next register in your own order. Use the arrange button to set that order.", "रजिस्टर फ़िल्टर के तीर आपके अपने क्रम में पिछला / अगला रजिस्टर खोलते हैं। क्रम तय करने के लिए arrange बटन इस्तेमाल करें।"),
        ] },
      ],
    },
    {
      id: "missing", icon: UserX, group: G_DAILY,
      title: t("Missing employees", "Missing Employees (छूटे कर्मचारी)"),
      summary: t("Employees whose attendance has not come.", "जिन कर्मचारियों की हाज़िरी नहीं आई।"),
      blocks: [
        { kind: "steps", items: [
          t("In **Detailed View** press **Missing Employees**.", "**Detailed View** में **Missing Employees** दबाएँ।"),
          t("Filter by department or dealing assistant, or search by name, EPID or designation.", "विभाग या डीलिंग असिस्टेंट से फ़िल्टर करें, या नाम, EPID या पद से खोजें।"),
          t("The table shows EPID, name, designation, department, status and term expiry.", "तालिका में EPID, नाम, पद, विभाग, स्थिति और Term Expiry दिखते हैं।"),
        ] },
        { kind: "tip", text: t("If the person has left, disable the employee in **Employees** so they stop showing here.", "अगर कर्मचारी जा चुका है, तो **Employees** में उसे disable करें। फिर वह यहाँ नहीं दिखेगा।") },
      ],
    },
    {
      id: "employees", icon: Users, group: G_STAFF,
      title: t("Employees", "Employees (कर्मचारी)"),
      summary: t("Add, edit, import, disable.", "जोड़ना, बदलना, इम्पोर्ट करना, disable करना।"),
      blocks: [
        { kind: "para", text: t("Open **Employees** from the menu (**Employee Management**). Use the search box or the filters (department, dealing assistant, Reg. No.) to find a person.", "मेन्यू से **Employees** खोलें (**Employee Management**)। कर्मचारी खोजने के लिए सर्च बॉक्स या फ़िल्टर (विभाग, डीलिंग असिस्टेंट, Reg. No.) इस्तेमाल करें।") },
        { kind: "steps", items: [
          t("To add a person press **Add Employee**. Fill name, EPID, department, designation, pay level, employment status and bank details. Fields marked with a red star are must.", "नया कर्मचारी जोड़ने के लिए **Add Employee** दबाएँ। नाम, EPID, विभाग, पद, पे लेवल, नियुक्ति की स्थिति और बैंक की जानकारी भरें। लाल तारे वाले खाने ज़रूरी हैं।"),
          t("To change details press the pencil button on the row, change, and save.", "बदलाव के लिए पंक्ति का पेंसिल बटन दबाएँ, बदलें और सेव करें।"),
          t("**Import Employees** (shown for Revolving Funds or Other Similar Funds staff) loads many people from an Excel file.", "**Import Employees** (रिवॉल्विंग फंड वाले स्टाफ़ के लिए) एक्सेल फ़ाइल से कई कर्मचारी जोड़ता है।"),
          t("**Download Excel** saves the list you see.", "**Download Excel** आपकी दिख रही सूची को सेव करता है।"),
          t("The history button shows what was changed earlier.", "history बटन पुराने बदलाव दिखाता है।"),
        ] },
        { kind: "warn", text: t("An employee who has attendance or payroll records can NEVER be deleted, because the old records would be lost. Use disable instead: switch the **Active** toggle off (or untick **Employee is Active** in the form). The record stays safe.", "जिस कर्मचारी का हाज़िरी या पेरोल रिकॉर्ड है, उसे कभी delete नहीं किया जा सकता, क्योंकि पुराना रिकॉर्ड मिट जाएगा। इसकी जगह disable करें: **Active** स्विच बंद करें (या फ़ॉर्म में **Employee is Active** का टिक हटाएँ)। रिकॉर्ड सुरक्षित रहता है।") },
        { kind: "note", text: t("If a person has already been reported this month, he can be disabled only after the 25th of the month. The red trash button works only for a person who was added by mistake and has no records.", "अगर कर्मचारी इस महीने रिपोर्ट हो चुका है, तो उसे महीने की 25 तारीख के बाद ही disable कर सकते हैं। लाल कूड़ेदान बटन सिर्फ़ गलती से जुड़े ऐसे कर्मचारी के लिए है जिसका कोई रिकॉर्ड नहीं है।") },
        { kind: "tip", text: t("For temporary or contract staff fill **Term Expiry Date**. The department is warned when the term ends before the attendance period.", "अस्थायी या संविदा स्टाफ़ के लिए **Term Expiry Date** भरें। अवधि खत्म होने पर विभाग को चेतावनी मिलती है।") },
      ],
    },
    {
      id: "transfers", icon: ArrowRightLeft, group: G_STAFF,
      title: t("Transfer requests", "Transfer Requests (तबादले)"),
      summary: t("Employee moves between departments.", "कर्मचारी का एक विभाग से दूसरे में जाना।"),
      blocks: [
        { kind: "steps", items: [
          t("Open **Transfer Requests** from the box on the **Dashboard**.", "**Dashboard** के डिब्बे से **Transfer Requests** खोलें।"),
          t("Filter by month or status: **Pending**, **Release Requested**, **Accepted**, **Rejected**. Search by employee, EPID or department.", "महीने या स्थिति से फ़िल्टर करें: **Pending**, **Release Requested**, **Accepted**, **Rejected**। कर्मचारी, EPID या विभाग से खोजें।"),
          t("Each row shows the employee, **From Dept**, **To Dept** and the type (transfer or release).", "हर पंक्ति में कर्मचारी, **From Dept**, **To Dept** और प्रकार (तबादला या रिलीज़) दिखता है।"),
          t("**Export Excel** saves the list. **Reset** clears the filters.", "**Export Excel** सूची सेव करता है। **Reset** फ़िल्टर हटाता है।"),
        ] },
        { kind: "note", text: t("The dashboard also has a **Reporting** count: employees who report at a department without a transfer. Click it to see and close them.", "डैशबोर्ड पर **Reporting** की गिनती भी है: जो कर्मचारी बिना तबादले के दूसरे विभाग में रिपोर्ट करते हैं। देखने और बंद करने के लिए उस पर दबाएँ।") },
      ],
    },
    {
      id: "email", icon: Mail, group: G_TALK,
      title: t("Email", "Email (ईमेल)"),
      summary: t("Your official mailbox inside the app.", "ऐप के अंदर आपका सरकारी मेलबॉक्स।"),
      blocks: [
        { kind: "list", items: [
          t("Open **Email** from the menu. A number on the button shows unread mails.", "मेन्यू से **Email** खोलें। बटन पर लिखा अंक बिना पढ़े मेल बताता है।"),
          t("Write a new mail: type the address in the **To** box, the **Subject**, the message, add attachments and send.", "नया मेल लिखें: **To** में पता, **Subject**, संदेश लिखें, अटैचमेंट जोड़ें और भेजें।"),
          t("You can reply, forward, preview or download attachments and delete a mail.", "आप जवाब दे सकते हैं, फ़ॉरवर्ड कर सकते हैं, अटैचमेंट देख या डाउनलोड कर सकते हैं और मेल मिटा सकते हैं।"),
        ] },
        { kind: "note", text: t("Reminders and alerts of the app also come to your mail address.", "ऐप के रिमाइंडर और अलर्ट भी आपके मेल पते पर आते हैं।") },
      ],
    },
    {
      id: "documents", icon: FileImage, group: G_TALK,
      title: t("Documents", "Documents (दस्तावेज़)"),
      summary: t("Circulars and letters for departments.", "विभागों के लिए परिपत्र और पत्र।"),
      blocks: [
        { kind: "steps", items: [
          t("Open **Documents** (**Document Gallery**).", "**Documents** (**Document Gallery**) खोलें।"),
          t("Press **Upload Document**, select the file, write a subject, choose type and department, and save.", "**Upload Document** दबाएँ, फ़ाइल चुनें, विषय लिखें, प्रकार और विभाग चुनें और सेव करें।"),
          t("Use **Edit Document** or **Delete Document** on a row to change or remove it. Use the search box to find a document.", "किसी पंक्ति पर **Edit Document** या **Delete Document** से बदलें या हटाएँ। खोजने के लिए सर्च बॉक्स इस्तेमाल करें।"),
        ] },
        { kind: "tip", text: t("Very large images are rejected. Make the file smaller and try again.", "बहुत बड़ी तस्वीर नहीं चलती। फ़ाइल छोटी करके दोबारा कोशिश करें।") },
      ],
    },
    {
      id: "dak", icon: Send, group: G_TALK,
      title: t("Dak (dispatch)", "Dak (डाक)"),
      summary: t("Letters sent out, groups and outside contacts.", "भेजे गए पत्र, ग्रुप और बाहर के संपर्क।"),
      blocks: [
        { kind: "para", text: t("**Dak Management** has five tabs.", "**Dak Management** में पाँच टैब हैं।") },
        { kind: "terms", items: [
          { term: t("Overview", "Overview"), text: t("Summary of the Dak.", "डाक का सार।") },
          { term: t("Tracking", "Tracking"), text: t("Follow a letter from the day it was sent.", "पत्र भेजने के दिन से उसकी स्थिति देखें।") },
          { term: t("Notifications", "Notifications"), text: t("Mails sent to departments about a dispatch.", "डाक के बारे में विभागों को गए मेल।") },
          { term: t("Dispatch Groups", "Dispatch Groups"), text: t("Make a group (for example all departments of a faculty) and add or remove members.", "ग्रुप बनाएँ (जैसे किसी फ़ैकल्टी के सभी विभाग) और सदस्य जोड़ें या हटाएँ।") },
          { term: t("External Contacts", "External Contacts"), text: t("Offices outside the university: name, address, phone, email.", "यूनिवर्सिटी के बाहर के दफ़्तर: नाम, पता, फ़ोन, ईमेल।") },
        ] },
        { kind: "note", text: t("A contact or group that is already in use cannot be deleted.", "जो संपर्क या ग्रुप इस्तेमाल में है, उसे हटाया नहीं जा सकता।") },
      ],
    },
    {
      id: "tickets-notices", icon: Megaphone, group: G_TALK,
      title: t("Tickets, notices and contacts", "Tickets, Notices और Contacts"),
      summary: t("Help requests from departments, messages to departments, phone list.", "विभागों की मदद के अनुरोध, विभागों को संदेश, फ़ोन सूची।"),
      blocks: [
        { kind: "terms", items: [
          { term: t("Tickets", "Tickets"), text: t("**Support Tickets**: a department asks for help. Open a ticket, type your answer in **Type your reply...** and press **Send**. The button shows a number for new tickets.", "**Support Tickets**: विभाग मदद माँगता है। टिकट खोलें, **Type your reply...** में जवाब लिखें और **Send** दबाएँ। नए टिकट की संख्या बटन पर दिखती है।") },
          { term: t("Notices", "Notices"), text: t("**Notice Management**: press **Send New Notice**, write the **Notice subject** and message, choose departments (or **Send to All Departments**) and press **Send Notice**. You can also send it by email with **Send Notice via Email**. Old notices can be deleted.", "**Notice Management**: **Send New Notice** दबाएँ, **Notice subject** और संदेश लिखें, विभाग चुनें (या **Send to All Departments**) और **Send Notice** दबाएँ। **Send Notice via Email** से मेल भी भेज सकते हैं। पुराने नोटिस मिटा सकते हैं।") },
          { term: t("Contacts", "Contacts"), text: t("**Contacts**: phone and email list of department people. Search by department, name, EPID, phone or email. You can download the list.", "**Contacts**: विभाग के लोगों की फ़ोन और ईमेल सूची। विभाग, नाम, EPID, फ़ोन या ईमेल से खोजें। सूची डाउनलोड कर सकते हैं।") },
        ] },
        { kind: "note", text: t("View-only logins do not see **Tickets** and **Notices**.", "सिर्फ़ देखने वाले (view-only) लॉगिन को **Tickets** और **Notices** नहीं दिखते।") },
      ],
    },
    {
      id: "lpc", icon: ScrollText, group: G_OTHER,
      title: t("LPC (Last Pay Certificate)", "LPC (अंतिम वेतन प्रमाणपत्र)"),
      summary: t("Make, sign, scan and email an LPC.", "LPC बनाना, हस्ताक्षर, स्कैन और मेल करना।"),
      blocks: [
        { kind: "para", text: t("Open **LPC** from the menu (**Last Pay Certificate (LPC)**). Search by dispatch no., EPID, name or department.", "मेन्यू से **LPC** खोलें (**Last Pay Certificate (LPC)**)। डिस्पैच नंबर, EPID, नाम या विभाग से खोजें।") },
        { kind: "steps", items: [
          t("Enter the employee details and the dispatch information. The app warns you if something is missing.", "कर्मचारी की जानकारी और डिस्पैच की जानकारी भरें। कुछ छूटे तो ऐप चेतावनी देता है।"),
          t("Create the PDF and print it for signature.", "PDF बनाएँ और हस्ताक्षर के लिए प्रिंट करें।"),
          t("After signing, scan it and press **Upload Scanned PDF/Image**.", "हस्ताक्षर के बाद स्कैन करें और **Upload Scanned PDF/Image** दबाएँ।"),
          t("The signed copy can be emailed to the employee or department.", "हस्ताक्षर वाली कॉपी कर्मचारी या विभाग को मेल की जा सकती है।"),
        ] },
        { kind: "note", text: t("This page is for the Salary Section only. Accounts, Bill and Students logins do not see it.", "यह पेज सिर्फ़ Salary Section के लिए है। Accounts, Bill और Students लॉगिन को नहीं दिखता।") },
      ],
    },
    {
      id: "claims", icon: FileSignature, group: G_OTHER,
      title: t("Claim Forms", "Claim Forms (दावा फ़ॉर्म)"),
      summary: t("Claims sent by employees through their departments.", "कर्मचारियों के दावे जो विभाग से आते हैं।"),
      blocks: [
        { kind: "list", items: [
          t("Open **Claim Forms**. Search by name, ID, department, reference or D. No.", "**Claim Forms** खोलें। नाम, ID, विभाग, रेफ़रेंस या D. No. से खोजें।"),
          t("Open a claim to read it and print it.", "दावा पढ़ने और प्रिंट करने के लिए उसे खोलें।"),
          t("Settings on this page: **Conveyance allowance rates** and **Departments whose employees may claim PCA**. Save after changing.", "इस पेज की सेटिंग: **Conveyance allowance rates** और **Departments whose employees may claim PCA**। बदलने के बाद सेव करें।"),
        ] },
      ],
    },
  ];

  if (isSuper) {
    topics.push(
      {
        id: "attendance-control", icon: CalendarClock, group: G_ADMIN,
        title: t("Attendance submission control", "Attendance Submission Control (हाज़िरी भेजना खोलना / बंद करना)"),
        summary: t("Start or stop attendance for all departments.", "सब विभागों के लिए हाज़िरी भेजना चालू या बंद करें।"),
        blocks: [
          { kind: "para", text: t("On the **Dashboard** (Salary Section view) the purple box **Attendance Submission Control** has two buttons.", "**Dashboard** (Salary Section) पर बैंगनी डिब्बे **Attendance Submission Control** में दो बटन हैं।") },
          { kind: "terms", items: [
            { term: t("Enable All", "Enable All"), text: t("All departments can create attendance reports.", "सभी विभाग हाज़िरी रिपोर्ट बना सकते हैं।") },
            { term: t("Disable All", "Disable All"), text: t("No department can create a report. Use it when the month is closed.", "कोई विभाग रिपोर्ट नहीं बना सकता। महीना बंद होने पर इस्तेमाल करें।") },
          ] },
          { kind: "tip", text: t("If only some departments are blocked, the box lists their names.", "अगर कुछ ही विभाग बंद हैं, तो डिब्बे में उनके नाम दिखते हैं।") },
        ],
      },
      {
        id: "section-switch", icon: Building2, group: G_ADMIN,
        title: t("Switching section and fund attendance", "सेक्शन बदलना और फंड हाज़िरी"),
        summary: t("Work as Accounts, Bill or Students Section.", "Accounts, Bill या Students Section की तरह काम करें।"),
        blocks: [
          { kind: "steps", items: [
            t("Open **Menu** and choose the **Section** (Salary, Accounts, Bill or Students).", "**Menu** खोलें और **Section** चुनें (Salary, Accounts, Bill या Students)।"),
            t("In Accounts, Bill or Students the **Payroll** button appears in the menu and the **Dashboard** shows only that section's staff.", "Accounts, Bill या Students में मेन्यू में **Payroll** बटन आता है और **Dashboard** में सिर्फ़ उसी सेक्शन का स्टाफ़ दिखता है।"),
            t("There the card **Revolving Funds or Other Similar Funds attendance** has an **Open / Closed** switch. It is ONE switch for all departments and all three sections. You are asked to confirm.", "वहाँ **Revolving Funds or Other Similar Funds attendance** कार्ड में **Open / Closed** स्विच है। यह सभी विभागों और तीनों सेक्शन के लिए एक ही स्विच है। पहले पुष्टि पूछी जाती है।"),
            t("In the **Dashboard** list use **Allow supplementary** for a department that must send one more report.", "**Dashboard** सूची में जिस विभाग को एक और रिपोर्ट भेजनी है, उसके लिए **Allow supplementary** इस्तेमाल करें।"),
          ] },
          { kind: "note", text: t("The full guide for those sections is in the other tab at the top of this page.", "उन सेक्शन की पूरी गाइड इस पेज के ऊपर वाले दूसरे टैब में है।") },
        ],
      },
      {
        id: "users", icon: UserCog, group: G_ADMIN,
        title: t("Users", "Users (उपयोगकर्ता)"),
        summary: t("Create and manage logins and departments.", "लॉगिन और विभाग बनाना और संभालना।"),
        blocks: [
          { kind: "steps", items: [
            t("Open **Users** (**User Management**). Search by name, email or department.", "**Users** (**User Management**) खोलें। नाम, ईमेल या विभाग से खोजें।"),
            t("Press **New User**. Enter the name and email, select the department or role, and save.", "**New User** दबाएँ। नाम और ईमेल भरें, विभाग या भूमिका चुनें और सेव करें।"),
            t("To add a department press **New Department** (**Create Department**) and give the name and a short code.", "विभाग जोड़ने के लिए **New Department** (**Create Department**) दबाएँ और नाम व छोटा कोड दें।"),
            t("To remove a login use **Delete User** and confirm.", "लॉगिन हटाने के लिए **Delete User** दबाकर पुष्टि करें।"),
          ] },
          { kind: "tip", text: t("A department login that is locked after wrong passwords can be opened from the **Dashboard**: open the locked accounts list and press **Unlock** (or **Unlock All**).", "गलत पासवर्ड से बंद हुआ विभाग का लॉगिन **Dashboard** से खुलता है: बंद खातों की सूची खोलकर **Unlock** (या **Unlock All**) दबाएँ।") },
        ],
      },
      {
        id: "settings", icon: Settings, group: G_ADMIN,
        title: t("Settings", "Settings (सेटिंग)"),
        summary: t("App-wide switches and the payroll database sync.", "पूरे ऐप की सेटिंग और पेरोल डेटाबेस सिंक।"),
        blocks: [
          { kind: "list", items: [
            t("**Attendance Term Check**: when a department makes a report, warn about temporary or probation staff whose term ends before the period.", "**Attendance Term Check**: विभाग रिपोर्ट बनाते समय उन अस्थायी या परिवीक्षा वाले कर्मचारियों की चेतावनी, जिनकी अवधि पहले खत्म हो रही हो।"),
            t("**Employee Form Field Visibility**: choose which fields (PAN, Bank Account, Aadhar, Employee Category) show in the employee form.", "**Employee Form Field Visibility**: कर्मचारी फ़ॉर्म में कौन-से खाने दिखें (PAN, Bank Account, Aadhar, Employee Category)।"),
            t("A card with **Open** goes to the payroll database sync pages (tabs **Employees** and **Paybill History**).", "**Open** वाला कार्ड पेरोल डेटाबेस सिंक के पेज (टैब **Employees** और **Paybill History**) पर ले जाता है।"),
          ] },
          { kind: "para", text: t("In plain words, the sync pages compare the employee list of this app with the payroll database. They only READ the payroll database and never change it. The tabs show: differences, empty fields that can be filled, people who should be disabled, people who should be active, new employees, and people not found there.", "आसान शब्दों में, सिंक पेज इस ऐप की कर्मचारी सूची को पेरोल डेटाबेस से मिलाते हैं। ये पेरोल डेटाबेस को सिर्फ़ पढ़ते हैं, कभी बदलते नहीं। टैब में दिखता है: अंतर, भरे जा सकने वाले खाली खाने, जिन्हें disable करना चाहिए, जिन्हें active होना चाहिए, नए कर्मचारी और जो वहाँ नहीं मिले।") },
          { kind: "warn", text: t("Settings change the whole app for everybody. Change them only when you are sure. Some pages may ask for a PIN.", "सेटिंग पूरे ऐप को सबके लिए बदल देती हैं। पक्का होने पर ही बदलें। कुछ पेज PIN माँग सकते हैं।") },
        ],
      },
    );
  }

  topics.push(
    {
      id: "glossary", icon: BookOpen, group: G_HELP,
      title: t("Words used in the app", "ऐप के शब्द"),
      summary: t("What the short words mean.", "छोटे शब्दों का मतलब।"),
      blocks: [
        { kind: "terms", items: [
          { term: t("EPID", "EPID"), text: t("Employee ID. For Revolving Funds staff it starts with a letter (for example R0001).", "कर्मचारी की ID। रिवॉल्विंग फंड स्टाफ़ की ID अक्षर से शुरू होती है (जैसे R0001)।") },
          { term: t("Supplementary", "Supplementary"), text: t("An extra attendance report for the same month.", "उसी महीने की एक और हाज़िरी रिपोर्ट।") },
          { term: t("Submitted / Draft", "Submitted / Draft"), text: t("Sent by the department / still being written.", "विभाग ने भेज दी / अभी लिखी जा रही है।") },
          { term: t("Term Expiry", "Term Expiry"), text: t("Last date of a temporary or contract job.", "अस्थायी या संविदा नौकरी की आखिरी तारीख।") },
          { term: t("Dealing assistant", "डीलिंग असिस्टेंट"), text: t("The salary section person who looks after a department.", "सैलरी सेक्शन का वह व्यक्ति जो विभाग देखता है।") },
        ] },
      ],
    },
    {
      id: "faq", icon: HelpCircle, group: G_HELP,
      title: t("Questions and answers", "सवाल-जवाब"),
      summary: t("Common problems.", "आम परेशानियाँ।"),
      blocks: [
        { kind: "faq", items: [
          { q: t("A department says it sent attendance but I cannot see it.", "विभाग कहता है कि हाज़िरी भेज दी, पर मुझे नहीं दिख रही।"),
            a: t("Check the month and the filters on the **Dashboard**. A report still in **Draft** is not sent. Also see **Missing** and **Cancelled**. If the department sent it for the wrong month, ask it to cancel and send again.", "**Dashboard** पर महीना और फ़िल्टर जाँचें। **Draft** वाली रिपोर्ट भेजी हुई नहीं मानी जाती। **Missing** और **Cancelled** भी देखें। अगर गलत महीने की भेज दी हो, तो विभाग से रद्द करके दोबारा भेजने को कहें।") },
          { q: t("A department wants to change a report it has sent.", "विभाग भेजी हुई रिपोर्ट बदलना चाहता है।"),
            a: t("The department asks to cancel or recall. You see **Accept Cancel** or **Approve Recall** on the row. Press it, and the department can correct and send again.", "विभाग रद्द करने या वापस लेने का अनुरोध करता है। पंक्ति में **Accept Cancel** या **Approve Recall** दिखता है। उसे दबाएँ, फिर विभाग सुधारकर दोबारा भेज सकता है।") },
          { q: t("I cannot delete an employee.", "मैं कर्मचारी को delete नहीं कर पा रहा।"),
            a: t("If the person has attendance or payroll records, deleting is not allowed. Disable the employee instead (**Active** toggle off).", "अगर कर्मचारी का हाज़िरी या पेरोल रिकॉर्ड है, तो delete नहीं हो सकता। इसकी जगह उसे disable करें (**Active** स्विच बंद)।") },
          { q: t("I cannot disable an employee.", "मैं कर्मचारी को disable नहीं कर पा रहा।"),
            a: t("A person already reported this month can be disabled only after the 25th. You can change only your own dealing assistant's employees.", "इस महीने रिपोर्ट हो चुके कर्मचारी को 25 तारीख के बाद ही disable कर सकते हैं। आप सिर्फ़ अपने डीलिंग असिस्टेंट के कर्मचारी बदल सकते हैं।") },
          { q: t("A name is missing in the export.", "एक्सपोर्ट में एक नाम नहीं है।"),
            a: t("Check **Skip Already Exported**. If it is ticked, rows already marked as exported are left out. Use **Reset / Update Export Date** to clear the date.", "**Skip Already Exported** देखें। टिक हो तो पहले से exported पंक्तियाँ छूट जाती हैं। तारीख हटाने के लिए **Reset / Update Export Date** इस्तेमाल करें।") },
          { q: t("I cannot see a menu button (for example Users or Settings).", "मुझे कोई मेन्यू बटन (जैसे Users या Settings) नहीं दिख रहा।"),
            a: t("Each login sees only the pages it is allowed to use. Ask the Super Admin if you need more access.", "हर लॉगिन को सिर्फ़ अपनी अनुमति वाले पेज दिखते हैं। ज़्यादा अनुमति चाहिए तो सुपर एडमिन से कहें।") },
          { q: t("The page looks old or wrong.", "पेज पुराना या गलत दिख रहा है।"),
            a: t("Refresh the page. If you were away for long, log in again.", "पेज रिफ़्रेश करें। अगर बहुत देर बाद लौटे हैं, तो दोबारा लॉगिन करें।") },
        ] },
      ],
    },
  );
  return topics;
}

const SALARY_QUICK: Bi[] = [
  t("Log in. The **Dashboard** opens.", "लॉगिन करें। **Dashboard** खुलता है।"),
  t("Choose the month and see **Received** and **Missing** departments.", "महीना चुनें और **Received** और **Missing** विभाग देखें।"),
  t("Open **View Details** of each report and check it. Accept cancel requests.", "हर रिपोर्ट का **View Details** खोलकर जाँचें। रद्द करने के अनुरोध मंज़ूर करें।"),
  t("In **Detailed View** check days, write **Noting**, tick **Verified**.", "**Detailed View** में दिन जाँचें, **Noting** लिखें, **Verified** टिक करें।"),
  t("Use **Export** to make the file and mark entries as exported.", "**Export** से फ़ाइल बनाएँ और एंट्री को exported मार्क करें।"),
  t("Keep **Employees** up to date. Disable people who have left.", "**Employees** अपडेट रखें। जो चले गए उन्हें disable करें।"),
];

// ───────────────────────── SECTION GUIDE (Accounts / Bill / Students) ─────────────────────────

function sectionTopics(): HelpTopic[] {
  const G1 = t("Start here", "यहाँ से शुरू करें");
  const G2 = t("Staff & rates", "स्टाफ़ और दरें");
  const G3 = t("Attendance", "हाज़िरी");
  const G4 = t("Payroll", "पेरोल");
  const G5 = t("Files & payment", "फ़ाइलें और भुगतान");
  const G6 = t("Help", "मदद");

  return [
    {
      id: "who", icon: Building2, group: G1,
      title: t("Who is paid here and when", "यहाँ किसे वेतन मिलता है और कब"),
      summary: t("Your staff and the dates to remember.", "आपका स्टाफ़ और याद रखने की तारीखें।"),
      blocks: [
        { kind: "para", text: t("This section pays the staff of **Revolving Funds or Other Similar Funds**. Their Employee ID starts with a letter (for example R0001). Each section sees only its own staff.", "यह सेक्शन **Revolving Funds or Other Similar Funds** के स्टाफ़ को वेतन देता है। इनकी Employee ID अक्षर से शुरू होती है (जैसे R0001)। हर सेक्शन को सिर्फ़ अपना स्टाफ़ दिखता है।") },
        { kind: "terms", items: [
          { term: t("Accounts Section", "Accounts Section"), text: t("Dealing assistant codes **ACC** and **OTH**.", "डीलिंग असिस्टेंट कोड **ACC** और **OTH**।") },
          { term: t("Bill Section", "Bill Section"), text: t("Dealing assistant code **BIL**.", "डीलिंग असिस्टेंट कोड **BIL**।") },
          { term: t("Students Section", "Students Section"), text: t("Dealing assistant code **STU**.", "डीलिंग असिस्टेंट कोड **STU**।") },
        ] },
        { kind: "para", text: t("Dates (from the Finance Officer's circular) — for example, for the wages of **November**:", "तारीखें (वित्त अधिकारी के परिपत्र के अनुसार) — उदाहरण के लिए **नवंबर** के वेतन के लिए:") },
        { kind: "list", items: [
          t("Departments send November's attendance (Muster Roll) by the **last day of the month — 30 November**.", "विभाग नवंबर की हाज़िरी (Muster Roll) **महीने के आखिरी दिन — 30 नवंबर तक** भेजते हैं।"),
          t("The section pays the wages by **7 December** (the 7th of the next month).", "सेक्शन वेतन **7 दिसंबर तक** (अगले महीने की 7 तारीख) देता है।"),
          t("EPF and ESI dues are paid by **15 December** (the 15th of the next month).", "EPF और ESI की रकम **15 दिसंबर तक** (अगले महीने की 15 तारीख) जमा होती है।"),
        ] },
        { kind: "tip", text: t("The screens show the month you are paying, which is the previous month, until the last 5 days of the current month.", "स्क्रीन पर वही महीना दिखता है जिसका वेतन दे रहे हैं, यानी पिछला महीना, जब तक चालू महीने के आखिरी 5 दिन शुरू न हों।") },
      ],
    },
    {
      id: "dashboard", icon: LayoutDashboard, group: G1,
      title: t("Dashboard and the Open / Closed switch", "Dashboard और Open / Closed स्विच"),
      summary: t("See who has sent attendance. Open or close sending.", "किसने हाज़िरी भेजी, देखें। भेजना चालू या बंद करें।"),
      blocks: [
        { kind: "list", items: [
          t("The **Dashboard** shows **Received** and **Missing** departments for your own staff only.", "**Dashboard** पर सिर्फ़ आपके स्टाफ़ के **Received** और **Missing** विभाग दिखते हैं।"),
          t("Use **View PDF** or **View Details** on a row to read a department's report. **Accept Cancel** or **Approve Recall** appears when a department asks for it.", "विभाग की रिपोर्ट पढ़ने के लिए पंक्ति पर **View PDF** या **View Details** दबाएँ। जब विभाग कहे तब **Accept Cancel** या **Approve Recall** दिखता है।"),
          t("**Allow supplementary** (switch under the department name): lets that department send one more report for the same month.", "**Allow supplementary** (विभाग के नाम के नीचे का स्विच): उस विभाग को उसी महीने की एक और रिपोर्ट भेजने देता है।"),
        ] },
        { kind: "para", text: t("The card **Revolving Funds or Other Similar Funds attendance** has an **Open / Closed** switch. When it is **Open**, departments can send the attendance of these staff. When it is **Closed**, they cannot.", "**Revolving Funds or Other Similar Funds attendance** कार्ड में **Open / Closed** स्विच है। **Open** होने पर विभाग इस स्टाफ़ की हाज़िरी भेज सकते हैं। **Closed** होने पर नहीं।") },
        { kind: "warn", text: t("This is ONE switch for all departments and for all three sections (Accounts, Bill and Students together). The app asks you to confirm.", "यह सभी विभागों और तीनों सेक्शन (Accounts, Bill और Students) के लिए एक ही स्विच है। ऐप पहले पुष्टि पूछता है।") },
      ],
    },
    {
      id: "emails", icon: Mail, group: G1,
      title: t("E-mails and reminders", "ई-मेल और रिमाइंडर"),
      summary: t("What mails you get and what departments get.", "आपको कौन-से मेल आते हैं और विभागों को कौन-से।"),
      blocks: [
        { kind: "para", text: t("Mails come to the email address of your section login when:", "आपके सेक्शन लॉगिन के मेल पते पर मेल आता है जब:") },
        { kind: "list", items: [
          t("a department sends its attendance;", "कोई विभाग हाज़िरी भेजे;"),
          t("a department asks to cancel its report;", "कोई विभाग रिपोर्ट रद्द करने को कहे;"),
          t("a report is cancelled.", "कोई रिपोर्ट रद्द हो जाए।"),
        ] },
        { kind: "para", text: t("Also, on the day before the due date and on the 3rd of the next month you get a list of departments that have not sent yet.", "इसके अलावा, आखिरी तारीख से एक दिन पहले और अगले महीने की 3 तारीख को उन विभागों की सूची मिलती है जिन्होंने अभी तक नहीं भेजा।") },
        { kind: "note", text: t("Departments get their own reminders: 5 days before the month end, the day before, and an overdue mail on the 3rd.", "विभागों को अपने रिमाइंडर मिलते हैं: महीने के अंत से 5 दिन पहले, एक दिन पहले, और 3 तारीख को देरी का मेल।") },
      ],
    },
    {
      id: "employees", icon: Users, group: G2,
      title: t("Employees (your staff)", "Employees (आपका स्टाफ़)"),
      summary: t("Add, change, import and disable staff.", "स्टाफ़ जोड़ना, बदलना, इम्पोर्ट और disable करना।"),
      blocks: [
        { kind: "steps", items: [
          t("Open **Employees**. Press **Add Employee** for a new person (the Employee ID starts with a letter, for example R0001).", "**Employees** खोलें। नए कर्मचारी के लिए **Add Employee** दबाएँ (Employee ID अक्षर से शुरू होती है, जैसे R0001)।"),
          t("Fill the wage details:", "वेतन की जानकारी भरें:"),
        ] },
        { kind: "list", items: [
          t("**Wage category**: Clerical/Skilled, Semi-skilled or Unskilled.", "**Wage category**: Clerical/Skilled, Semi-skilled या Unskilled।"),
          t("**Monthly fixed wages** (optional). If the person works fewer days, the wage is cut pro rata.", "**Monthly fixed wages** (ज़रूरी नहीं)। कम दिन काम करने पर वेतन दिनों के हिसाब से घटता है।"),
          t("**EPF** (UAN number) and **ESI** (ESI no., and whether covered), and **MAS**.", "**EPF** (UAN नंबर), **ESI** (ESI नंबर और क्या कवर है) और **MAS**।"),
          t("**Payment Code** (the fund), bank, branch and IFSC, and **Term expiry**.", "**Payment Code** (फंड), बैंक, ब्रांच और IFSC, और **Term expiry**।"),
        ] },
        { kind: "steps", items: [
          t("Press **Import Employees** to load many people from an Excel file.", "बहुत-से कर्मचारी एक्सेल फ़ाइल से जोड़ने के लिए **Import Employees** दबाएँ।"),
          t("To change details, press the pencil button on the row.", "बदलाव के लिए पंक्ति का पेंसिल बटन दबाएँ।"),
        ] },
        { kind: "warn", text: t("A person who has attendance or payroll records cannot be deleted. Disable him instead (switch **Active** off).", "जिसका हाज़िरी या पेरोल रिकॉर्ड है, उसे delete नहीं कर सकते। उसे disable करें (**Active** बंद करें)।") },
        { kind: "tip", text: t("Missing bank account or IFSC? The person is listed in **Monthly files** and is not paid until it is fixed.", "बैंक खाता या IFSC नहीं है? वह **Monthly files** में दिखता है और ठीक होने तक उसका भुगतान नहीं होता।") },
      ],
    },
    {
      id: "rates", icon: Scale, group: G2,
      title: t("Rates and funds (Payroll settings)", "दरें और फंड (Payroll settings)"),
      summary: t("Wage rates, EPF / ESI / MAS and Payment Codes.", "वेतन की दरें, EPF / ESI / MAS और Payment Code।"),
      blocks: [
        { kind: "para", text: t("On the **Payroll** page press **Settings** to open **Payroll settings**. It has three tabs.", "**Payroll** पेज पर **Settings** दबाएँ। **Payroll settings** खुलती है। इसमें तीन टैब हैं।") },
        { kind: "terms", items: [
          { term: t("Wage rates", "Wage rates"), text: t("Rates are kept in sets with a **From date**, for each category: **Basic / day** and **VDA / day**. Add a new set when the rate changes. Old months keep their old rate.", "दरें हर श्रेणी के लिए **From date** वाले सेट में रहती हैं: **Basic / day** और **VDA / day**। दर बदले तो नया सेट जोड़ें। पुराने महीनों में पुरानी दर ही रहती है।") },
          { term: t("EPF / ESI / MAS", "EPF / ESI / MAS"), text: t("The percentages, limits and the MAS amount. Change them only when the rules change.", "प्रतिशत, सीमा और MAS की रकम। नियम बदलने पर ही बदलें।") },
          { term: t("Funds (Payment Codes)", "Funds (Payment Codes)"), text: t("Department code, fund name, **Payment Code** and **Payment Head (printed)**. Search, add one, or use **Import funds from Excel**.", "विभाग कोड, फंड का नाम, **Payment Code** और **Payment Head (printed)**। खोजें, एक जोड़ें, या **Import funds from Excel** इस्तेमाल करें।") },
        ] },
        { kind: "tip", text: t("If a row on **Monthly payroll** has no fund, press the Funds link or open **Settings** and add the Payment Code first.", "अगर **Monthly payroll** की किसी पंक्ति में फंड नहीं है, तो **Settings** खोलकर पहले Payment Code जोड़ें।") },
      ],
    },
    {
      id: "paper", icon: FileText, group: G3,
      title: t("Paper attendance", "कागज़ी हाज़िरी"),
      summary: t("When a department sent attendance on paper.", "जब विभाग ने हाज़िरी कागज़ पर भेजी हो।"),
      blocks: [
        { kind: "para", text: t("Use this when a department gives the Muster Roll on paper. You enter it for the department. It is on the **Payroll** page, in **Monthly payroll** view.", "जब विभाग Muster Roll कागज़ पर दे, तब यह इस्तेमाल करें। आप विभाग की ओर से इसे भरते हैं। यह **Payroll** पेज के **Monthly payroll** दृश्य में है।") },
        { kind: "steps", items: [
          t("On the department's row press **Enter paper attendance**.", "विभाग की पंक्ति में **Enter paper attendance** दबाएँ।"),
          t("For each employee enter the from and to dates. You can add several periods. **Fill full month for all** fills the whole month for everybody.", "हर कर्मचारी के लिए से और तक की तारीख भरें। कई अवधि जोड़ सकते हैं। **Fill full month for all** सबके लिए पूरा महीना भर देता है।"),
          t("Enter the **Department letter No.** and **Letter date**.", "**Department letter No.** और **Letter date** भरें।"),
          t("Add the scanned copy (PDF / JPG / PNG). It is optional now and can be uploaded later. Save.", "स्कैन की कॉपी जोड़ें (PDF / JPG / PNG)। अभी ज़रूरी नहीं, बाद में भी डाल सकते हैं। सेव करें।"),
        ] },
        { kind: "para", text: t("For many departments at once use **Import paper attendance (Excel)** at the top of the page:", "कई विभागों के लिए एक साथ पेज के ऊपर **Import paper attendance (Excel)** इस्तेमाल करें:") },
        { kind: "steps", items: [
          t("Press **Download template**. Fill the columns **Employee ID**, **From Date**, **To Date**, **Days**.", "**Download template** दबाएँ। कॉलम भरें: **Employee ID**, **From Date**, **To Date**, **Days**।"),
          t("Open the file in the dialog. The app checks it first and shows departments, employees and days, and any errors. Correct errors and press **Check again**.", "फ़ाइल डायलॉग में खोलें। ऐप पहले जाँचता है और विभाग, कर्मचारी, दिन और गलतियाँ दिखाता है। गलतियाँ सुधारकर **Check again** दबाएँ।"),
          t("When there are no errors press **Import**.", "गलती न रहने पर **Import** दबाएँ।"),
        ] },
        { kind: "warn", text: t("A roll cannot be passed until the scanned copy is uploaded. Use **Upload scan** on the row. It is not allowed if the department has already started or sent its own online report. Paper attendance can be deleted only while no roll exists.", "स्कैन की कॉपी लगे बिना roll पास नहीं हो सकता। पंक्ति में **Upload scan** दबाएँ। अगर विभाग ने अपनी ऑनलाइन रिपोर्ट शुरू या भेज दी है, तो यह नहीं हो सकता। कागज़ी हाज़िरी तभी मिटाई जा सकती है जब roll न बना हो।") },
      ],
    },
    {
      id: "month", icon: Wallet, group: G4,
      title: t("Monthly payroll", "Monthly payroll (महीने का पेरोल)"),
      summary: t("One row for each department and fund.", "हर विभाग और फंड की एक पंक्ति।"),
      blocks: [
        { kind: "para", text: t("Open **Payroll** from the menu (**Wages Payroll**). The first view is **Monthly payroll**.", "मेन्यू से **Payroll** खोलें (**Wages Payroll**)। पहला दृश्य **Monthly payroll** है।") },
        { kind: "steps", items: [
          t("Choose the **Month** and **Year**.", "**Month** और **Year** चुनें।"),
          t("Each row is one department and one fund (**Payment Code**). The **Attendance** badge shows **Received**, **Pending** or **Not received**.", "हर पंक्ति एक विभाग और एक फंड (**Payment Code**) की है। **Attendance** बैज में **Received**, **Pending** या **Not received** दिखता है।"),
          t("When attendance is **Received**, press **Prepare roll**. The roll opens.", "हाज़िरी **Received** हो तो **Prepare roll** दबाएँ। roll खुल जाता है।"),
          t("If a roll already exists, press **Open**.", "roll बना हो तो **Open** दबाएँ।"),
        ] },
        { kind: "para", text: t("The boxes on top count rolls: **Passed**, **Finalised**, **Draft**, **Not prepared**, and the total gross, total net and employer EPF + ESI.", "ऊपर के डिब्बे roll गिनते हैं: **Passed**, **Finalised**, **Draft**, **Not prepared**, और कुल Gross, कुल Net और नियोक्ता का EPF + ESI।") },
        { kind: "tip", text: t("No attendance yet? Ask the department, or use **Enter paper attendance** if it sent a paper copy.", "हाज़िरी नहीं आई? विभाग से कहें, या कागज़ की कॉपी आई हो तो **Enter paper attendance** इस्तेमाल करें।") },
      ],
    },
    {
      id: "roll", icon: ClipboardCheck, group: G4,
      title: t("The roll: check, finalise, pass", "Roll: जाँचें, Finalise करें, पास करें"),
      summary: t("Draft → Finalised → Passed.", "Draft → Finalised → Passed।"),
      blocks: [
        { kind: "para", text: t("The roll shows one line for each employee: category, rate, **Days**, **Gross**, **EPF**, **ESI**, **MAS**, **Net**, and **Checks**.", "roll में हर कर्मचारी की एक पंक्ति है: श्रेणी, दर, **Days**, **Gross**, **EPF**, **ESI**, **MAS**, **Net**, और **Checks**।") },
        { kind: "steps", items: [
          t("Check the days of each person. If you change the days, the app asks for a reason.", "हर व्यक्ति के दिन जाँचें। दिन बदलें तो ऐप कारण पूछता है।"),
          t("Use the **EPF**, **ESI** and **MAS** switches if a person should not have one.", "अगर किसी पर EPF, ESI या MAS नहीं लगना हो, तो उनके स्विच इस्तेमाल करें।"),
          t("Read **Checks**. A red warning must be fixed before you can finalise. If the payment head or code is empty, use **Edit head / code for this roll**.", "**Checks** पढ़ें। लाल चेतावनी ठीक किए बिना Finalise नहीं होगा। payment head या code खाली हो तो **Edit head / code for this roll** इस्तेमाल करें।"),
          t("If attendance changed after the roll was made, press **Rebuild from attendance**.", "roll बनने के बाद हाज़िरी बदली हो, तो **Rebuild from attendance** दबाएँ।"),
          t("Press **Finalise**. The roll is now **Finalised** and cannot be edited.", "**Finalise** दबाएँ। roll अब **Finalised** है और बदला नहीं जा सकता।"),
          t("Press **Pass for payment**. Enter the **Page No.** and the **Date of passing**. The roll is now **Passed**.", "**Pass for payment** दबाएँ। **Page No.** और **Date of passing** भरें। roll अब **Passed** है।"),
        ] },
        { kind: "warn", text: t("Wrong days after **Finalise**? Press **Reopen** and type the **Reason for reopening**. Then correct and finalise again. A passed roll must be reopened first.", "**Finalise** के बाद दिन गलत निकले? **Reopen** दबाएँ और **Reason for reopening** लिखें। फिर सुधारकर दोबारा Finalise करें। passed roll को पहले reopen करना पड़ता है।") },
        { kind: "list", items: [
          t("**Print Muster Roll** and **Download** give the Muster Roll.", "**Print Muster Roll** और **Download** से Muster Roll मिलता है।"),
          t("**Pay slips (PDF)** gives all slips of the roll.", "**Pay slips (PDF)** roll की सारी पर्चियाँ देता है।"),
          t("**Pay Register (Excel)** gives the register.", "**Pay Register (Excel)** रजिस्टर देता है।"),
          t("**Delete roll** removes a draft roll that is not needed. The history at the bottom shows who did what.", "**Delete roll** बेकार draft roll हटाता है। नीचे का इतिहास बताता है कि किसने क्या किया।"),
        ] },
      ],
    },
    {
      id: "history", icon: History, group: G4,
      title: t("Employee history", "Employee history (कर्मचारी का इतिहास)"),
      summary: t("Look up past payments of any person.", "किसी का भी पुराना भुगतान देखें।"),
      blocks: [
        { kind: "steps", items: [
          t("On the **Payroll** page choose **Employee history** (next to **Monthly payroll**).", "**Payroll** पेज पर **Employee history** चुनें (**Monthly payroll** के पास)।"),
          t("Type in **EPID, name, account no., UAN or ESI no.** Choose where to look in **Search in**.", "**EPID, name, account no., UAN or ESI no.** लिखें। **Search in** से तय करें कहाँ खोजना है।"),
          t("Narrow down with **Department**, **Head of account**, **Status**, **From month** and **To month**. **Clear** removes the filters.", "**Department**, **Head of account**, **Status**, **From month** और **To month** से सीमित करें। **Clear** फ़िल्टर हटाता है।"),
          t("The totals are shown above the list. Open the roll or the pay slip of any line with the small buttons.", "कुल रकम सूची के ऊपर दिखती है। छोटे बटनों से किसी भी पंक्ति का roll या pay slip खोलें।"),
          t("**Download Excel** saves the list.", "**Download Excel** सूची सेव करता है।"),
        ] },
      ],
    },
    {
      id: "files", icon: FileSpreadsheet, group: G5,
      title: t("Monthly files", "Monthly files (महीने की फ़ाइलें)"),
      summary: t("Bank, EPF, ESI and liability files.", "बैंक, EPF, ESI और देनदारी की फ़ाइलें।"),
      blocks: [
        { kind: "para", text: t("Below the table of **Monthly payroll** is the card **Monthly files**. Press a name to download.", "**Monthly payroll** की तालिका के नीचे **Monthly files** कार्ड है। डाउनलोड के लिए नाम पर दबाएँ।") },
        { kind: "terms", items: [
          { term: t("Pay Register", "Pay Register"), text: t("Every employee with Basic, VDA, Gross, deductions, net payable and employer share. Includes all rolls of the month.", "हर कर्मचारी का Basic, VDA, Gross, कटौती, देय Net और नियोक्ता का हिस्सा। महीने के सभी roll आते हैं।") },
          { term: t("Bank payment sheet (branch-wise)", "Bank payment sheet (branch-wise)"), text: t("The payment list for each bank branch.", "हर बैंक ब्रांच की भुगतान सूची।") },
          { term: t("Bank Advice (per fund + branch)", "Bank Advice (per fund + branch)"), text: t("The advice letter for the bank.", "बैंक के लिए सलाह पत्र।") },
          { term: t("EPF ECR (.txt)", "EPF ECR (.txt)"), text: t("The file to upload on the EPFO portal.", "EPFO पोर्टल पर अपलोड करने की फ़ाइल।") },
          { term: t("ESI sheet", "ESI sheet"), text: t("The ESI contribution list.", "ESI अंशदान की सूची।") },
          { term: t("Employer liability", "Employer liability"), text: t("What the university has to pay as employer.", "नियोक्ता के रूप में विश्वविद्यालय को जो देना है।") },
        ] },
        { kind: "warn", text: t("Only rolls that are **Passed** go into the bank, EPF, ESI and liability files. If nothing is passed, there is nothing to download.", "सिर्फ़ **Passed** roll ही बैंक, EPF, ESI और liability फ़ाइलों में जाते हैं। कुछ पास न हो, तो डाउनलोड के लिए कुछ नहीं होता।") },
        { kind: "list", items: [
          t("The card also lists **Missing UAN**, **Missing ESI number** and **Missing bank account / IFSC**. Fix them in **Employees**.", "कार्ड में **Missing UAN**, **Missing ESI number** और **Missing bank account / IFSC** की सूची भी है। इन्हें **Employees** में ठीक करें।"),
          t("Lines with no bank account or IFSC are not paid until fixed.", "जिन पंक्तियों में बैंक खाता या IFSC नहीं है, उनका भुगतान ठीक होने तक नहीं होता।"),
        ] },
      ],
    },
    {
      id: "cheques", icon: Landmark, group: G5,
      title: t("Cheques and releasing pay slips", "चेक और पे स्लिप जारी करना"),
      summary: t("Enter cheque numbers, then release slips.", "चेक नंबर भरें, फिर पर्चियाँ जारी करें।"),
      blocks: [
        { kind: "para", text: t("The card **Cheques & pay slip release** has one row for each fund (**Payment Code**) and bank branch.", "**Cheques & pay slip release** कार्ड में हर फंड (**Payment Code**) और बैंक ब्रांच की एक पंक्ति है।") },
        { kind: "steps", items: [
          t("For every row type the **Cheque No.** and the **Cheque Date**, and save. A message **Cheque saved** appears.", "हर पंक्ति में **Cheque No.** और **Cheque Date** भरकर सेव करें। **Cheque saved** संदेश आता है।"),
          t("When every cheque is entered, press **Release pay slips**. The badge changes from **Not released** to **Released**.", "सब चेक भर जाने पर **Release pay slips** दबाएँ। बैज **Not released** से **Released** हो जाता है।"),
          t("To take them back, press **Withdraw pay slips**.", "वापस लेने के लिए **Withdraw pay slips** दबाएँ।"),
        ] },
        { kind: "note", text: t("The release button is off until every cheque is entered. The card tells you how many cheques are still to enter. A row with missing bank details cannot get a cheque.", "जब तक हर चेक न भरा जाए, release बटन बंद रहता है। कार्ड बताता है कि कितने चेक बाकी हैं। जिस पंक्ति में बैंक की जानकारी नहीं है, उसका चेक नहीं बन सकता।") },
      ],
    },
    {
      id: "slips", icon: ReceiptText, group: G5,
      title: t("Pay slip for employees", "कर्मचारियों की पे स्लिप"),
      summary: t("How employees see their slip.", "कर्मचारी अपनी पर्ची कैसे देखते हैं।"),
      blocks: [
        { kind: "steps", items: [
          t("The employee opens the login page and presses **Pay Slip (Revolving Funds or Other Similar Funds)**. No login is needed.", "कर्मचारी लॉगिन पेज खोलकर **Pay Slip (Revolving Funds or Other Similar Funds)** दबाता है। लॉगिन नहीं चाहिए।"),
          t("He enters the Employee ID and either the date of joining or the bank account number.", "वह Employee ID और या तो जॉइनिंग की तारीख या बैंक खाता नंबर भरता है।"),
          t("He sees the slips of the months you have released.", "आपने जिन महीनों की पर्ची जारी की है, वे दिखती हैं।"),
        ] },
        { kind: "para", text: t("The slip shows a line for each attendance period with days, earnings, deductions and net, and the cheque details.", "पर्ची में हर हाज़िरी अवधि की पंक्ति होती है: दिन, कमाई, कटौती और Net, और चेक की जानकारी।") },
        { kind: "warn", text: t("Employees see the slip only after you press **Release pay slips**.", "**Release pay slips** दबाने के बाद ही कर्मचारी को पर्ची दिखती है।") },
      ],
    },
    {
      id: "glossary", icon: BookOpen, group: G6,
      title: t("Words used in payroll", "पेरोल के शब्द"),
      summary: t("Short meanings.", "छोटे अर्थ।"),
      blocks: [
        { kind: "terms", items: [
          { term: t("Gross", "Gross"), text: t("Total earning before cuts (Basic + VDA for the days worked).", "कटौती से पहले की कुल कमाई (काम के दिनों का Basic + VDA)।") },
          { term: t("Net", "Net"), text: t("Gross minus EPF, ESI and MAS. This is the amount paid.", "Gross में से EPF, ESI और MAS घटाकर बची रकम। यही दी जाती है।") },
          { term: t("VDA", "VDA"), text: t("Variable Dearness Allowance, added to Basic every day.", "परिवर्तनीय महँगाई भत्ता, हर दिन Basic में जुड़ता है।") },
          { term: t("EPF", "EPF"), text: t("Employee pays 12%. Employer pays 13%.", "कर्मचारी 12% देता है। नियोक्ता 13% देता है।") },
          { term: t("ESI", "ESI"), text: t("Employee 0.75%, employer 3.25%, for wages up to ₹21,000.", "कर्मचारी 0.75%, नियोक्ता 3.25%, ₹21,000 तक के वेतन पर।") },
          { term: t("MAS", "MAS"), text: t("A fixed deduction of ₹125.", "₹125 की तय कटौती।") },
          { term: t("Payment Code", "Payment Code"), text: t("The code of the fund from which wages are paid.", "उस फंड का कोड जिससे वेतन दिया जाता है।") },
          { term: t("Muster Roll", "Muster Roll"), text: t("The attendance sheet of a department for the month.", "विभाग की महीने की हाज़िरी शीट।") },
          { term: t("Draft", "Draft"), text: t("Roll is made but can still be changed.", "roll बन गया है पर अभी बदला जा सकता है।") },
          { term: t("Finalised", "Finalised"), text: t("Roll is checked and locked. It can be reopened with a reason.", "roll जाँचकर बंद कर दिया गया। कारण लिखकर फिर खोल सकते हैं।") },
          { term: t("Passed", "Passed"), text: t("Roll is passed for payment with page no. and date. It goes into the bank, EPF and ESI files.", "roll भुगतान के लिए पास हो गया, पेज नंबर और तारीख के साथ। यह बैंक, EPF और ESI फ़ाइलों में जाता है।") },
        ] },
      ],
    },
    {
      id: "faq", icon: HelpCircle, group: G6,
      title: t("Questions and answers", "सवाल-जवाब"),
      summary: t("Common problems and what to do.", "आम परेशानियाँ और उनका हल।"),
      blocks: [
        { kind: "faq", items: [
          { q: t("A department says it sent attendance but I cannot see it.", "विभाग कहता है हाज़िरी भेज दी, पर मुझे नहीं दिख रही।"),
            a: t("Check the month (the screen shows the month being paid). A report still in draft is not sent. Check the **Open / Closed** switch on the **Dashboard**: if it is **Closed**, departments cannot send. If the department sent it on paper, use **Enter paper attendance**.", "महीना जाँचें (स्क्रीन पर वही महीना है जिसका भुगतान हो रहा है)। draft रिपोर्ट भेजी हुई नहीं मानी जाती। **Dashboard** का **Open / Closed** स्विच देखें: **Closed** हो तो विभाग नहीं भेज सकते। कागज़ पर भेजी हो तो **Enter paper attendance** इस्तेमाल करें।") },
          { q: t("I cannot press Prepare roll.", "मैं Prepare roll नहीं दबा पा रहा।"),
            a: t("The button shows only when the attendance badge says **Received**. Get the attendance first (online or paper).", "यह बटन तभी दिखता है जब Attendance बैज **Received** हो। पहले हाज़िरी लें (ऑनलाइन या कागज़ी)।") },
          { q: t("The days are wrong after Finalise.", "Finalise के बाद दिन गलत निकले।"),
            a: t("Press **Reopen**, write the reason, correct the days (give a reason for the change), then **Finalise** again. If the roll was passed, reopen it first.", "**Reopen** दबाएँ, कारण लिखें, दिन सुधारें (बदलाव का कारण भी बताएँ), फिर दोबारा **Finalise** करें। roll पास हो चुका हो तो पहले reopen करें।") },
          { q: t("I cannot Finalise.", "मैं Finalise नहीं कर पा रहा।"),
            a: t("There is a red warning under **Checks**, or the payment head or code is empty. Fix them and try again.", "**Checks** में कोई लाल चेतावनी है, या payment head या code खाली है। उन्हें ठीक करके दोबारा कोशिश करें।") },
          { q: t("I cannot press Pass for payment.", "मैं Pass for payment नहीं दबा पा रहा।"),
            a: t("For paper attendance the scanned copy must be uploaded. Press **Upload scan** on the department's row. Then pass the roll.", "कागज़ी हाज़िरी में स्कैन की कॉपी लगी होनी चाहिए। विभाग की पंक्ति में **Upload scan** दबाएँ। फिर roll पास करें।") },
          { q: t("An employee cannot see the pay slip.", "कर्मचारी को पे स्लिप नहीं दिख रही।"),
            a: t("Check that the roll is passed, that every cheque is entered, and that you pressed **Release pay slips**. Tell the employee to use the **Pay Slip** page on the login screen with the Employee ID and the date of joining or bank account number.", "देखें कि roll पास है, हर चेक भरा है और आपने **Release pay slips** दबाया है। कर्मचारी को बताएँ कि लॉगिन स्क्रीन के **Pay Slip** पेज पर Employee ID और जॉइनिंग की तारीख या बैंक खाता नंबर भरे।") },
          { q: t("Bank account is missing for an employee.", "किसी कर्मचारी का बैंक खाता नहीं है।"),
            a: t("He is listed under **Missing bank account / IFSC** in **Monthly files**, and is not paid. Add the account and IFSC in **Employees**.", "वह **Monthly files** में **Missing bank account / IFSC** में दिखता है और उसका भुगतान नहीं होता। **Employees** में खाता और IFSC भरें।") },
          { q: t("Release pay slips is greyed out.", "Release pay slips दबता नहीं (धुंधला है)।"),
            a: t("One or more cheques are not entered. The card shows how many are left. A row with missing bank details must be fixed first.", "एक या ज़्यादा चेक नहीं भरे हैं। कार्ड बताता है कितने बाकी हैं। जिस पंक्ति में बैंक की जानकारी नहीं है उसे पहले ठीक करें।") },
          { q: t("The EPF or ESI file is empty.", "EPF या ESI फ़ाइल खाली है।"),
            a: t("Only rolls that are **Passed** go into these files. Pass the rolls first. People with **Missing UAN** or **Missing ESI number** should be corrected in **Employees**.", "इन फ़ाइलों में सिर्फ़ **Passed** roll आते हैं। पहले roll पास करें। **Missing UAN** या **Missing ESI number** वालों को **Employees** में ठीक करें।") },
          { q: t("I cannot delete an employee.", "मैं कर्मचारी delete नहीं कर पा रहा।"),
            a: t("A person with attendance or payroll records cannot be deleted. Disable him instead.", "जिसका हाज़िरी या पेरोल रिकॉर्ड है, उसे delete नहीं कर सकते। उसे disable करें।") },
        ] },
      ],
    },
  ];
}

const SECTION_QUICK: Bi[] = [
  t("Open the **Dashboard**. Check **Received** and **Missing** departments. Make sure the **Open / Closed** switch is right.", "**Dashboard** खोलें। **Received** और **Missing** विभाग देखें। **Open / Closed** स्विच सही रखें।"),
  t("If a department sent attendance on paper, use **Enter paper attendance** on the **Payroll** page.", "विभाग ने कागज़ पर हाज़िरी भेजी हो, तो **Payroll** पेज पर **Enter paper attendance** इस्तेमाल करें।"),
  t("On **Payroll** choose the month and press **Prepare roll**, then check the lines.", "**Payroll** में महीना चुनें, **Prepare roll** दबाएँ और पंक्तियाँ जाँचें।"),
  t("Press **Finalise**, then **Pass for payment** with the page no. and date.", "**Finalise** दबाएँ, फिर पेज नंबर और तारीख के साथ **Pass for payment**।"),
  t("Download the bank, EPF and ESI files from **Monthly files**.", "**Monthly files** से बैंक, EPF और ESI फ़ाइलें डाउनलोड करें।"),
  t("Enter the cheques and press **Release pay slips**.", "चेक भरें और **Release pay slips** दबाएँ।"),
];

// ───────────────────────── PAGE ─────────────────────────

type GuideKey = "salary" | "section";

export default function AdminHelp() {
  const section = useAdminSection();
  const access = getAdminAccess();
  const sectionIsFund = section === "accounts" || section === "bill" || section === "students";
  const [guide, setGuide] = useState<GuideKey>(sectionIsFund ? "section" : "salary");
  // Only the Super Admin can read either guide; everybody else sees the guide of the login
  const shown: GuideKey = access.isSuperAdmin ? guide : sectionIsFund ? "section" : "salary";

  let content;
  if (shown === "section") {
    // A Super Admin reading this guide from the Salary Section sees a general badge
    const badge: Bi = sectionIsFund && (isSectionLogin() || access.isSuperAdmin)
      ? t(sectionLabel(section), sectionLabel(section))
      : t("Accounts / Bill / Students", "Accounts / Bill / Students");
    const name = sectionIsFund ? sectionLabel(section) : "Accounts / Bill / Students Section";
    content = (
      <HelpGuide
        key="section"
        title={t(`${name} — User Guide`, `${name} — उपयोग गाइड`)}
        badge={badge}
        intro={t(
          "How to receive attendance, make the wage roll, pay and release pay slips for Revolving Funds or Other Similar Funds staff.",
          "रिवॉल्विंग फंड या ऐसे ही दूसरे फंड के स्टाफ़ की हाज़िरी लेना, वेतन roll बनाना, भुगतान करना और पे स्लिप जारी करना।")}
        quickStart={SECTION_QUICK}
        topics={sectionTopics()}
      />
    );
  } else {
    content = (
      <HelpGuide
        key="salary"
        title={t("Salary Section — User Guide", "Salary Section — उपयोग गाइड")}
        badge={access.isSuperAdmin ? t("Super Admin", "Super Admin") : t("Salary Section", "Salary Section")}
        intro={t(
          "How to check attendance reports, keep employees up to date, and use mail, documents and the other tools of the Salary Section.",
          "हाज़िरी रिपोर्ट जाँचना, कर्मचारियों की जानकारी ठीक रखना, और मेल, दस्तावेज़ व Salary Section के दूसरे साधन इस्तेमाल करना।")}
        quickStart={SALARY_QUICK}
        topics={salaryTopics(access.isSuperAdmin)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader />
      <main className="max-w-[1400px] mx-auto px-4 py-6">
        {access.isSuperAdmin && (
          <div className="mx-auto mb-4 flex w-full max-w-6xl flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-sm font-medium text-slate-600"><ShieldCheck className="h-4 w-4" /> Guide for:</span>
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm" role="tablist" aria-label="Guide for">
              {([["salary", "Salary Section"], ["section", "Accounts / Bill / Students Section"]] as const).map(([k, label]) => (
                <button key={k} type="button" role="tab" aria-selected={shown === k} onClick={() => setGuide(k)}
                  className={cn("rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    shown === k ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100")}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
        {content}
      </main>
    </div>
  );
}
