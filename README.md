# AI-Powered CV Builder

Instantly create ATS-optimized, tailored CVs for any job description. This single-page application is simple, fast, and completely private—all your data stays in your browser.

![AI CV Builder Screenshot](https://storage.googleapis.com/aistudio-project-marketplace-app-screenshot/2405.1000/cv-builder.png)

## ✨ Core Features

*   **🤖 AI-Powered Generation**: Paste any job description to get a CV instantly tailored with the right keywords and focus.
*   **👤 One-Time Profile Setup**: Enter your professional information once and save it. Use the AI generator to parse an existing CV or even your GitHub profile to get started faster.
*   **📄 Multiple Templates & Fonts**: Choose from a variety of professional, modern, and technical templates to match your style.
*   **🚀 ATS Optimization**: Automatically embeds job description text invisibly into your PDF, significantly improving your chances of passing through automated screening systems.
*   **✍️ AI-Enhanced Content**: Use AI to rewrite and improve your summary, work experience bullet points, and project descriptions.
*   **✉️ Cover Letter Generation**: Instantly create a compelling cover letter based on your profile and the job description.
*   **🎯 Application Tracker**: A simple, built-in tracker to manage the roles you've applied for.
*   **🔒 Privacy First**: All your data—profile, generated CVs, and API key—is stored **only** in your browser's local storage. There is no backend server, no database, and no account required.
*   **📦 PWA Support**: Install the app on your desktop or mobile device for a native-like experience and offline access.

## 🚀 Getting Started: A 5-Minute Guide

### 1. Set Your API Key
This app uses the Google Gemini API to power its AI features. You'll need your own API key.

-   Go to **Settings** (⚙️ icon) in the app.
-   Select **Google Gemini** as the AI Provider.
-   Get your free key from [Google AI Studio](https://aistudio.google.com/app/apikey).
-   Paste the key into the input field and click **Save**. This is a one-time setup.

### 2. Create Your Profile
This is the foundational data for all your CVs.
-   **Manual Entry**: Click "Fill Manually" and fill out the form with your personal info, work experience, education, skills, etc.
-   **AI Generation (Recommended)**: Click "Generate with AI". You can:
    -   Paste the text from your old resume.
    -   Upload a PDF/image of your current CV.
    -   Provide your GitHub URL to auto-populate your projects and skills.
-   The AI will parse the information and fill out the form for you. Review it and click **Save Profile**.

### 3. Generate a Tailored CV
-   Paste a full job description into the "CV Customization" text area.
-   Choose the purpose (Job or Academic).
-   Enable "AI Enhancements" if you want the AI to suggest ideal, fictional experiences to make you a stronger candidate.
-   Click **Generate Tailored CV**.

### 4. Customize and Download
-   Your new, tailored CV will appear in the "CV Preview" section.
-   Choose a **Template** and **Font** that you like.
-   Click **Edit CV** to make any final manual adjustments directly on the preview.
-   Click **Download PDF**. You will get a confirmation that the ATS optimization data has been embedded.

## 💻 Tech Stack

-   **Frontend**: React, TypeScript, Tailwind CSS
-   **AI Integration**: Google Gemini API (`@google/genai`)
-   **State Management**: React Hooks (`useState`, `useLocalStorage`)
-   **Form Handling**: `react-hook-form`
-   **PDF Generation**: `jspdf`
-   **PWA**: Service Worker for offline functionality.

## 🛠️ Running Locally (For Developers)

To set up and run this project on your local machine:

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/ai-cv-builder.git
    cd ai-cv-builder
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Run the development server:**
    ```bash
    npm run dev 
    # or npm start, depending on your setup
    ```

4.  **Set Your API Key in the App:**
    -   Open the application in your browser (usually at `http://localhost:5173`).
    -   Click the **Settings** (⚙️) icon.
    -   Add your Google Gemini API Key. The app will now be fully functional. No `.env` file is required as the key is managed in the browser's local storage for user convenience.

## 🔒 A Note on Privacy

Your privacy is paramount. This application has been architected to run entirely in your browser.

-   **No Data Transmission**: Your personal information, CV content, and API key are never sent to any server controlled by this application. All API calls are made directly from your browser to the Google Gemini service.
-   **Local Storage**: All data is persisted in your browser's `localStorage`. This means your data stays on your machine. Clearing your browser's site data for this app will permanently erase all your information.
-   **No Tracking or Analytics**: The app contains no third-party tracking or analytics services.