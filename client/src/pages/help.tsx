import React from "react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm'; // For GitHub Flavored Markdown (tables, etc.)
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const introContent = `
Welcome to the Dashboard! This guide will walk you through the main features available to manage your department's employees, attendance, and documents.
`;

const helpSections = [
  {
    value: "item-1",
    title: "Logging In",
    content: `
1.  Navigate to the Department Login page.
2.  Enter the **Email** and **Password** provided to you.
3.  Click **Sign In**.

**IMPORTANT: First Time Login**

If this is your first time logging in, the credentials provided are temporary. You **MUST** immediately navigate to the **Settings** page (however by default you will be redirected to the Settings page after logging in with temporary credentials) **(see Section 6 below)** and update the following:
    **Your HOD Title,**
    **Your HOD Name,**
    **Your Email Address,**
    **Your Password.**

Failure to update these default details may prevent you from using features of the app and prevent to access Dashboard.

**Other Login Options:**

*   **Forgot Password?:** If you forget your password (after setting your own), click this link to initiate the password recovery process. A reset password link will be sent to your email.
*   **Admin Login:** This link is for Administrators.
`
  },
  {
    value: "item-2",
    title: "1. Dashboard Overview",
    content: `
Upon logging in, you'll see the main dashboard overview. This page gives you a quick snapshot:

*   **Total Employees:** Shows the current number of active employees registered under your department.
*   **Attendance Reports:** Shows the total number of attendance reports created for your department.

Use the sidebar on the left to navigate to different sections.
`
  },
  {
    value: "item-3",
    title: "2. Managing Employees (Employees Page)",
    content: `
This section allows you to manage your department's employee records.

*   **Viewing Employees:** The main table lists all employees with their EPID (Employee Personal ID), Name, Designation, Status, and Term Expiry.
*   **Searching:** Use the search bar at the top to quickly find employees by their EPID, Name, or Designation.
*   **Viewing Details:** Click the **Eye** icon next to an employee to see their full details, including contact information, joining details, and links to view their uploaded documents (PAN, Bank Proof, Aadhar, Office Memo, Joining Report, etc.).
*   **Adding a New Employee:**
    1.  Click the **Add Employee** button.
    2.  Fill out the required employee information in the form.
    3.  Upload necessary documents (PAN Card, Bank Account Proof (Passbook), Aadhar Card, Office Memo, Joining Report, Term Extension Memo if applicable) by clicking the respective upload areas. You can capture images directly by phone camera (open app in phone browser), if needed.
    4.  Click **Add Employee** to save the record. The system checks for unique EPIDs.
*   **Editing an Employee:**
    1.  Click the **Pencil** icon next to the employee you want to edit.
    2.  Modify the necessary details in the form. You can also update or replace existing documents.
    3.  Click **Update Employee** to save changes.
`
  },
  {
    value: "item-4",
    title: "3. Managing Attendance (Attendance Page)",
    content: `
This section is for creating, submitting, and managing monthly attendance reports.

*   **Viewing Reports:** The table lists all attendance reports created for your department, showing the month, year, status (Draft, Submitted, Sent), Transaction ID, and Despatch details.
*   **Creating a New Report:**
    1.  Click the **Create Report** button.
    2.  Select the **Month** and **Year** for the report (By default, the current month and year are selected).
    3.  The form will load all employees in your department.
    4.  For each employee *not* present for the full month, click **Add Period** and enter the **From Date**, **To Date**, Total Days calculated automatically (absence/leave/specific information etc.), and any **Remarks**. You can add multiple periods per employee if needed. Employees with no periods added are assumed present for the full month.
    5.  Review all entries carefully.
    6.  Click **Create Report**. The report will be saved with a 'Draft' status.
*   **Finalizing a Draft Report:**
    1.  Find the 'Draft' report in the table.
    2.  Click the **Finalize** button (with the FileCheck icon).
    3.  Confirm the action. The status will change to 'Submitted'.
*   **Deleting a Draft Report:**
    1.  Find the 'Draft' report.
    2.  Click the **Delete** button (Trash icon).
    3.  Confirm the action. *This cannot be undone.*
*   **Uploading the Signed Report (After Finalizing):**
    1.  After finalizing, print the report (see Section 4). Get it signed by the HOD.
    2.  Find the 'Submitted' report in the table.
    3.  Click the **Upload Signed Report** button (Upload icon).
    4.  Enter the **Despatch No** and **Despatch Date**.
    5.  Click the file input area to select the scanned **PDF or Image (JPEG/PNG)** file of the signed report.
    6.  Click **Submit**. The report status will change to 'Sent', and the file will be attached.
*   **Viewing Signed Report:**
    1.  Find a 'Sent' report.
    2.  Click the **View Signed Report** button (Eye icon). This will open a preview of the uploaded PDF or image.
*   **Viewing Report Details:**
    1.  Click the **View Details** button (Eye icon next to View Signed Report/Upload Signed Report) for any report.
    2.  This takes you to the detailed view (see Section 4).
`
  },
  {
    value: "item-5",
    title: "4. Viewing Report Details (Report Details Page)",
    content: `
This page provides a detailed, printable view of a specific attendance report.

*   **Information:** Shows report header details (Department, Period, Status, Transaction ID, Despatch Info).
*   **Attendance Data:** Displays the full table of attendance entries for the selected month.
*   **Actions:**
    *   **View PDF:** If a signed report was uploaded, click this to view the PDF/image file.
    *   **Download Excel:** Click to download the report data as an Excel spreadsheet.
    *   **Print:** Click to open a print-optimized version of the report. This version includes a barcode for the transaction ID and is formatted for official use. Ensure your browser allows pop-ups.
    *   **Close:** Takes you back to the main Attendance page.
`
  },
  {
    value: "item-6",
    title: "5. Document Gallery (Document Gallery Page)",
    content: `
This gallery stores important office documents for reference.

*   **Viewing Documents:** Browse uploaded documents displayed as cards with image previews. Click an image to view the full-size version in a new tab.
*   **Searching:** Use the search bar to find documents by type, issuing authority, subject, reference number, date, or the uploading department.
*   **Filtering by Date:** Use the date pickers to show documents uploaded within a specific date range. Click the 'X' button next to the date inputs to clear the filter.
*   **Uploading a New Document:**
    1.  Click the **Upload Document** button.
    2.  Click the upload area to select an **image file (JPEG, PNG, JPG only, max 5MB)**. The image will be watermarked automatically. A preview will be shown.
    3.  Select the **Document Type**.
    4.  Enter the **Issuing Authority**, **Subject**, **Ref. No.**, and **Date** of the document.
    5.  Click **Upload**.
`
  },
  {
    value: "item-7",
    title: "6. Settings (Settings Page)",
    content: `
Manage your department's profile and your account password.

*   **Updating Profile:**
    1.  Go to the **Profile** tab.
    2.  Update the **HOD Title**, **HOD Name**, and **Email** fields as needed. (Department Name cannot be changed).
    3.  Click **Update Profile**. *It's important to ensure these details are correct for official reports.*
*   **Changing Password:**
    1.  Go to the **Password** tab.
    2.  Enter your **Current Password**.
    3.  Enter your **New Password**.
    4.  **Confirm** the new password.
    5.  Click **Change Password**.
`
  }
];

const outroContent = `
---

If you encounter any issues, please contact the system administrator.
`;

export default function Help() {
  return (
    <div className="flex min-h-screen">
      <Sidebar className="w-64 border-r" />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6">
          <h1 className="text-3xl font-bold mb-4">User Guide</h1>
          <p className="text-muted-foreground mb-6">{introContent}</p>

          <Accordion type="single" collapsible className="w-full space-y-2">
            {helpSections.map((section) => (
              <AccordionItem value={section.value} key={section.value}>
                <AccordionTrigger className="text-lg font-semibold hover:no-underline px-4">
                  {section.title}
                </AccordionTrigger>
                <AccordionContent className="px-4 pt-2 pb-4">
                  <div className="prose prose-slate max-w-none prose-sm md:prose-base">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {section.content}
                    </ReactMarkdown>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          <div className="prose prose-slate max-w-none prose-sm md:prose-base mt-8 pt-4 border-t">
             <ReactMarkdown remarkPlugins={[remarkGfm]}>
               {outroContent}
             </ReactMarkdown>
          </div>
        </main>
      </div>
    </div>
  );
} 