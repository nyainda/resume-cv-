# ProCV — AI Coding Rules
# Every AI assistant editing this project MUST follow these rules.

## WHO YOU ARE
You are maintaining ProCV — a premium CV builder tool for professionals.
It looks like a high-end HR consultancy tool, NOT a generic AI SaaS product. Keep it that way.

## THE STACK
- React + TypeScript
- Tailwind CSS (but prefer inline styles for custom brand colors)
- Fonts: Playfair Display (headings) + DM Sans (body)

## APPROVED COLOR PALETTE — ONLY THESE

Primary Navy:    #1B2B4B  (buttons, logo, active states)
Gold Accent:     #C9A84C  (accents, active nav, focus rings)
Background:      #F8F7F4  (page bg, input backgrounds)
Surface:         #FFFFFF  (card backgrounds)
Text Primary:    #1A1A1A  (all headings and body)
Text Muted:      #6B7280  (subtitles, descriptions)
Text Hint:       #9CA3AF  (labels, placeholders, meta)
Border:          #E5E2DC  (cards and inputs)
Success:         #15803D on #F0FDF4
Warning:         #B45309 on #FFFBEB
Error:           #B91C1C on #FEF2F2
Info:            #1D4ED8 on #EFF6FF

## BANNED COLORS — NEVER USE THESE
- Any shade of indigo (indigo-50 through indigo-950)
- Any shade of purple or violet
- Blue gradient backgrounds
- #4f46e5 or any similar purple-blue hex
- Any color not in the approved list above

## APPROVED TYPOGRAPHY

Headings h1/h2/h3: font-family: 'Playfair Display', serif
All other text:    font-family: 'DM Sans', sans-serif

Size scale:
  Page title:    22px, weight 700, Playfair Display, #1A1A1A
  Card heading:  18px, weight 600, Playfair Display, #1A1A1A
  Section label: 11px, weight 600, UPPERCASE, #9CA3AF
  Body:          14px, weight 400, DM Sans, #1A1A1A
  Sub/muted:     13px, weight 400, DM Sans, #6B7280
  Small/meta:    11px, weight 400, DM Sans, #9CA3AF
  Gold label:    10px, weight 700, UPPERCASE, #C9A84C

## COMPONENT STANDARDS

### Cards (one style only):
  background: #FFFFFF
  border-radius: 12px
  border: 0.5px solid #E5E2DC
  padding: 20px
  margin-bottom: 16px
  NO box-shadow

### Buttons (3 types only):
  Primary:   bg #1B2B4B, text #FFFFFF, radius 10px, padding 12px 24px, weight 600
  Secondary: bg transparent, border 0.5px #1B2B4B, text #1B2B4B, radius 10px, weight 500
  Ghost:     bg transparent, border 0.5px rgba(201,168,76,0.4), text #C9A84C, radius 8px, weight 600

### Inputs/Textareas:
  background: #F8F7F4
  border: 0.5px solid #E5E2DC
  border-radius: 8px
  padding: 12px
  font-family: DM Sans, 13px, #1A1A1A
  On focus: border-color #C9A84C

### Status Pills (identical everywhere):
  Applied:      bg #EFF6FF, text #1D4ED8
  Interviewing: bg #FFFBEB, text #B45309
  Offer:        bg #F0FDF4, text #15803D
  Rejected:     bg #FEF2F2, text #B91C1C
  Wishlist:     bg #F3F4F6, text #374151

## ABSOLUTE RULES

NEVER use Tailwind indigo/purple/violet classes
NEVER write "AI" in any user-visible heading, button, or label
NEVER use Inter or Roboto fonts — always DM Sans + Playfair Display
NEVER create a 4th button type
NEVER add box-shadow to cards
ALWAYS use Playfair Display for h1/h2/h3 elements
ALWAYS ask: does this look consistent with every other page?
