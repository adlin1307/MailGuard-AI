"""
Generate a diverse, realistic, labeled email dataset for ProbMail.
Contains a realistic distribution of legitimate workplace/personal emails (Ham)
and realistic spam/phishing emails (Spam).
"""
import os
import pandas as pd

emails = [
    # --- HAM (Legitimate) Emails ---
    ("ham", "Q3 Engineering Sprint Retrospective Notes", "Hi team, thanks everyone for joining today's sprint retrospective. The action items and Jira ticket links are compiled on Confluence. Let's make sure code reviews are completed before Wednesday."),
    ("ham", "Quarterly Budget Planning for Dev Team", "Hello Sarah, please find attached the draft figures for our server infrastructure budget for Q4. Cloud compute usage decreased by 8% due to our database indexing optimizations."),
    ("ham", "Code Review: PR #342 - Refactor Chi-Square Feature Selector", "Hi Alex, I reviewed your pull request. The vectorizer caching looks great, but could you please add a unit test checking edge cases where vocabulary count is smaller than k?"),
    ("ham", "Lunch Catchup Tomorrow?", "Hey Mark, are we still on for lunch tomorrow at 12:30? Let me know if the campus cafe works or if you prefer the deli downstairs."),
    ("ham", "Weekly Department All-Hands Agenda", "Good morning all, our department all-hands meeting will be held at 3:00 PM EST via Google Meet. Topics include quarterly milestones, new team member introductions, and product roadmap updates."),
    ("ham", "Customer Support Ticket #89211 Resolution", "Dear customer, your request regarding API key rate limits has been resolved. We have increased your tier quota to 5,000 requests per minute as requested."),
    ("ham", "GitLab CI/CD Pipeline Succeeded: master branch", "Pipeline #9812 for commit 4f8a291 on branch master succeeded in 4m 12s. All 48 unit and integration tests passed without warnings."),
    ("ham", "Research Seminar: Probabilistic Models in Cybersecurity", "Reminder: Professor Chen's seminar on Bayesian text classification and feature selection is scheduled for Thursday at 4 PM in Hall B. Refreshments will be served."),
    ("ham", "Invoice Receipt: GitHub Enterprise Cloud Subscription", "Thank you for your payment. Your receipt for invoice #GH-908231 is attached. Amount charged: $140.00. Payment method: Corporate Visa ending in 4192."),
    ("ham", "Draft Paper Feedback: Naive Bayes vs Gradient Boosted Trees", "Hi David, I read through the methodology section of your draft. The Chi-Square comparison is very thorough. I suggested some minor grammatical edits in the shared Overleaf document."),
    ("ham", "Server Maintenance Window Notification: Sunday 02:00 UTC", "Notice from DevOps: Routine kernel upgrades and security patches will be applied to our staging and production clusters on Sunday between 02:00 and 04:00 UTC. Brief intermittent downtime may occur."),
    ("ham", "Project ProbMail: Architecture Review Meeting", "Hi team, please find the updated architecture diagram and data flow specification attached for tomorrow's review with the stakeholders. Focus areas: preprocessing and model serialization."),
    ("ham", "Invitation: Machine Learning Reading Group Discussion", "This week we are discussing 'Feature Selection for Text Categorization on Imbalanced Data' by Forman. Meeting link is in the calendar invite."),
    ("ham", "Expense Report #EX-4019 Approved", "Your travel expense report for the IEEE conference has been approved by management and submitted to payroll for processing in the upcoming cycle."),
    ("ham", "Frontend TypeScript Migration Update", "Team, the TypeScript migration for the user settings module is 90% complete. Please avoid modifying files in src/legacy until the merge is completed tonight."),
    ("ham", "Office Parking Permit Renewal Form", "All employees requiring parking access for the next academic year must submit the renewal form to Facilities by Friday at 5:00 PM."),
    ("ham", "AWS Billing Alert: Current Month Forecast", "This is an automated alert from AWS Budgets. Your forecasted monthly spend of $420 is within your target threshold of $500. No action required."),
    ("ham", "Internship Mentorship Check-in", "Hi Kevin, let's schedule our 1-on-1 for Friday at 11 AM to discuss your progress on the SQLite storage adapter and testing suite."),
    ("ham", "Library Notice: Book Return Due in 3 Days", "Your borrowed item 'Pattern Recognition and Machine Learning' is due for return on Monday. You may renew online through the portal if no other holds are placed."),
    ("ham", "Database Migration Complete", "The PostgreSQL schema migration to version 2.4.0 completed successfully in 12 seconds with zero failed migrations. Staging services are back online."),
    ("ham", "Python 3.13 Upgrade Compatibility Notes", "Devs, please note that we are upgrading virtual environments to Python 3.13. Check that your local packages match the pinned requirements.txt before committing."),
    ("ham", "Design System Component Guidelines", "Hi designers, the updated dark navy and slate color tokens for our security SaaS dashboard have been published to Figma. Please review the button contrast ratios."),
    ("ham", "Conference Registration Confirmation: KDD 2026", "Thank you for registering for KDD 2026. Your registration confirmation number is KDD-89012. We look forward to your attendance in August."),
    ("ham", "API Documentation Feedback", "The updated OpenAPI 3.0 documentation for the /api/predict and /api/analytics endpoints is now live on our developer portal. Please test the sandbox examples."),
    ("ham", "Holiday Schedule and Office Closure", "Please note that the university campus and research labs will be closed next Monday in observance of the public holiday. Regular hours resume on Tuesday."),
    ("ham", "Code Quality Report: Static Analysis Results", "SonarQube analysis completed for commit 89ab31: 0 vulnerabilities, 0 bugs, 94.2% test coverage. Quality gate passed."),
    ("ham", "Coffee machine fixed in 3rd floor lounge", "Quick heads up, the espresso machine on the 3rd floor break room has been repaired and restocked with beans."),
    ("ham", "Doctor's Appointment Reminder", "This is a reminder of your upcoming appointment with Dr. Henderson on Wednesday at 10:30 AM. Please arrive 10 minutes early to complete check-in."),
    ("ham", "Team Standup Notes and Blockers", "Standup notes: Maya is finishing the dataset preview table; Eric is working on the Chi-Square p-value matrix; Rachel is resolving CORS configuration."),
    ("ham", "Package Delivered to Reception Desk", "Your package from McMaster-Carr has arrived at the central receiving dock and can be picked up during standard office hours."),
    ("ham", "Student Project Evaluation Schedule", "Dear Students, the oral viva and project demonstrations for the Machine Learning course will be conducted in Lab 402 starting next Tuesday. Be prepared to explain feature selection."),
    ("ham", "Security Vulnerability Scan: Clean Report", "Weekly vulnerability scan report: No critical or high CVEs detected across container images. Container registry scanned 18 images."),
    ("ham", "Data Science Workshop Materials", "Attached are the lecture slides, Jupyter notebooks, and sample CSV data for yesterday's workshop on TF-IDF representation and Naive Bayes."),
    ("ham", "Request for Letter of Recommendation", "Dear Professor, I hope this email finds you well. I am applying for graduate study in Data Science and would be deeply grateful if you would consider writing a recommendation letter."),
    ("ham", "New Employee Onboarding Checklist", "Welcome to the engineering team! Please complete your security training modules and SSH key submission within your first week."),
    ("ham", "Flight Itinerary: SFO to ORD", "Your United Airlines booking confirmation is 8U9K2L. Flight 1402 departs SFO at 08:15 AM on October 14. Terminal 3, Seat 12B."),
    ("ham", "Software License Renewal Notice: JetBrains", "Your JetBrains student/academic license pack has been automatically renewed for another calendar year. Access is active on all tools."),
    ("ham", "Performance Review Cycle: Self-Evaluation Due", "A reminder to all staff that mid-year self-assessments are due in Workday by 5:00 PM next Friday. Please contact HR with questions."),
    ("ham", "Volunteering for University Science Day", "If you are interested in volunteering to demonstrate robotics and AI projects to visiting high school students, please sign up on the spreadsheet."),
    ("ham", "Backup Verification: Daily Snapshot Successful", "Daily automated snapshot of production database probmail_db succeeded at 03:00 UTC. Backup size: 142 MB, checksum verified."),
    ("ham", "Meeting Minutes: Department Curriculum Committee", "Attached are the formal minutes from Wednesday's curriculum review meeting. The new applied machine learning elective was approved unanimously."),
    ("ham", "Hardware Requisition: Dual 4K Monitors", "Your IT requisition #IT-5519 for dual monitors has been approved by your department chair and ordered through Dell Premier."),
    ("ham", "Open Source Contribution Acknowledged", "Your pull request to scikit-learn documentation has been merged by the maintainers! Thank you for contributing to the community."),
    ("ham", "Quarterly Fire Drill Scheduled", "The building management team will conduct an unannounced fire alarm test sometime between 10:00 AM and 11:30 AM on Thursday. Evacuate via stairwells."),
    ("ham", "Feedback on Project Presentation Draft", "Hi Michael, your presentation slides look great. I recommend adding a confusion matrix breakdown to slide 8 so the reviewers can see the false positive rate clearly."),
    ("ham", "Lost and Found: Wireless Mouse in Room 301", "A Logitech wireless ergonomic mouse was left behind after the 2 PM lab session in Room 301. It is currently at the technical assistant desk."),
    ("ham", "Stripe Payout Notification", "A payout of $1,280.50 has been sent to your checking account ending in 1932. Payouts typically arrive within 1-2 business days."),
    ("ham", "Academic Calendar Updates for Fall Semester", "The registrar's office has released the revised academic calendar for the upcoming fall semester. Please review final exam scheduling deadlines."),
    ("ham", "Colleague Birthday Celebration", "We will gather in the 2nd floor conference room at 3:30 PM today for cupcakes to celebrate Dan's birthday. Everyone is welcome!"),
    ("ham", "Git Tag Release v1.0.0-rc1", "Tag v1.0.0-rc1 has been pushed by buildbot. Release artifacts and Docker images have been published to the internal artifact repository."),

    # --- SPAM & PHISHING Emails ---
    ("spam", "URGENT: Your Bank Account Has Been Suspended!", "Dear Customer, We detected unauthorized login attempts on your online banking account. To prevent permanent suspension, you must verify your identity immediately by clicking here: http://secure-bank-login-verify-account.com/action. Failure to verify within 24 hours will result in asset freeze."),
    ("spam", "CONGRATULATIONS! You Have Won $1,000,000 in the International Lottery!", "You have been selected as the grand prize winner of $1,000,000 in our annual sweepstakes draw! Claim your cash prize now by sending your full name, phone number, address, and bank account details to claims@cash-lottery-promo.org."),
    ("spam", "Exclusive Crypto Investment: 500% Guaranteed ROI in 7 Days!", "Do not miss out on this automated Bitcoin and crypto trading bot! Guaranteed daily returns of 15% with zero risk. Deposit minimum $250 today and watch your wealth multiply. Click http://crypto-billionaire-guarantee.biz to invest now!"),
    ("spam", "Claim Your $500 Amazon Gift Card Now!", "Congratulations valued shopper! You were chosen to receive a free $500 Amazon gift voucher. Click the link below and complete a short 1-minute survey to receive your instant digital claim code: http://free-giftcard-rewards2026.net"),
    ("spam", "Immediate Action Required: Microsoft 365 Password Expiration Alert", "Your Microsoft 365 work email password will expire in 2 hours. To maintain access and keep your current password, verify your credentials here: http://office365-login-update-security-portal.com/auth. Failure to update will lock your mailbox."),
    ("spam", "Pre-approved Unsecured Loan Offer: Up to $50,000 Fast Cash", "Bad credit? No problem! Get instant pre-approval for up to $50,000 cash loan directly deposited to your bank account within 2 hours. No credit check required! Apply now: http://fast-cash-lenders-now.info/apply"),
    ("spam", "URGENT Invoice Attached: Overdue Payment Notice #INV-9921", "Dear Accounts Payable, Your invoice #9921 is 45 days past due. Please open the attached remittance macro file invoice_overdue.docm or click http://pay-invoice-direct.ru/download to settle your balance before legal action is initiated."),
    ("spam", "Cheap Pharmacy: Viagra, Cialis, and Levitra with No Prescription!", "Buy generic medications online at 90% discount! No doctor prescription needed. Fast discreet worldwide shipping with free bonus pills on all orders over $60. Order online today: http://cheap-meds-express-rx.com"),
    ("spam", "Confidential Business Partnership: $25.5 Million Transfer", "I am Barrister Williams representing the estate of a deceased client. I am seeking your trustworthy assistance to transfer $25,500,000 into your foreign bank account. You will receive 40% of the total funds as commission. Reply urgently."),
    ("spam", "IRS Notice: Unclaimed Tax Refund of $3,450.00", "Internal Revenue Service tax refund notification: We have processed your annual tax return and calculated an unclaimed refund of $3,450.00. Submit your SSN, banking info, and date of birth at http://irs-tax-refund-portal.gov.fake-irs-web.com to claim."),
    ("spam", "FedEx Delivery Alert: Package Pending - Address Missing", "FedEx Tracking: Your shipment could not be delivered due to an incorrect home address. To update your delivery address and pay the $1.99 redelivery fee, visit: http://fedex-parcel-tracking-update.xyz/reschedule"),
    ("spam", "PayPal Security Alert: Suspicious Transaction Detected", "We noticed an unauthorized charge of $849.00 to Apple Store on your PayPal account. If you did not make this purchase, click here immediately to dispute the charge and protect your account: http://paypal-resolution-center-dispute.biz"),
    ("spam", "Earn $5,000/Week Working From Home! No Experience Required", "Work from home part-time and earn $500 to $1,000 daily! We supply full training and materials. Only 2 hours per day required. Limited spots available for your city. Register today at http://work-from-home-careers-now.org"),
    ("spam", "Hot Singles in Your Area Want to Chat Tonight!", "Meet local singles looking for discreet dating tonight! 100% anonymous, free registration, thousands of verified profiles online right now. Click here to browse photos: http://local-dating-singles-fun.com"),
    ("spam", "Netflix Account Suspended: Billing Information Invalid", "We were unable to process your monthly Netflix subscription payment. Your membership has been put on hold. Please update your credit card details immediately at http://netflix-billing-update-center.cc/login to continue watching."),
    ("spam", "URGENT: Cease and Desist Copyright Infringement Notice", "You are illegally hosting copyrighted images on your website without a commercial license. View the list of infringing image URLs and legal settlement demands here: http://copyright-infringement-case-files.ru/doc.zip"),
    ("spam", "Congratulations! You won a brand new Apple iPhone 16 Pro!", "You are today's lucky visitor selected to receive a free Apple iPhone 16 Pro (256GB). Confirm your shipping address and pay only $1.00 postage: http://iphone16-free-rewards-promo.club"),
    ("spam", "Wire Transfer Confirmation: $18,400.00 Pending Approval", "CEO Emergency Request: I am in a board meeting and cannot take calls. I need you to immediately execute an urgent wire transfer of $18,400.00 to our vendor's new bank account details below. Confirm once completed."),
    ("spam", "DocuSign: Please Sign Agreement Regarding Salary Increase", "Human Resources has sent you a document for digital signing: 'Executive Compensation and Salary Adjustment 2026.pdf'. Review and sign document here: http://docusign-secure-document-signing-portal.net/view"),
    ("spam", "Apple ID Security: Your Account Has Been Locked", "Your Apple ID was used to sign in to iCloud from an unrecognized device in Moscow, Russia. Your account is temporarily locked. Click http://appleid-apple-verify-identity.com/unlock to confirm your identity."),
    ("spam", "Claim 100 Free Spins at Golden Palace Casino!", "Sign up today and get 100 free spins plus 300% deposit match bonus up to $2,000! Instant withdrawals, licensed jackpots, play slots and blackjack now: http://golden-palace-slots-bonus.biz"),
    ("spam", "DHL Express: Your Shipment Has Been Detained at Customs", "DHL Express notification: Parcel tracking #DH-882194 has been detained by international customs. An outstanding clearance duty fee of $4.85 must be paid to release shipment. Visit http://dhl-customs-clearance-payment.info"),
    ("spam", "Final Notice: Your Domain Registration Is About To Expire!", "Domain notification: Your domain registration will expire in 48 hours and will be released for public auction. Renew your domain now for $89 to prevent loss of service: http://domain-registry-renewal-notice.com/pay"),
    ("spam", "Increase Your Website Traffic by 10,000 Visitors a Day!", "Guaranteed SEO rankings on page 1 of Google. High quality backlinks, social media signals, and targeted web traffic. Packages start at only $29. Check our packages: http://top-seo-ranking-boosters.com"),
    ("spam", "ATTN: CEO / Managing Director - Unclaimed Funds", "Good day, I am an auditor at African Development Bank. During an internal audit we uncovered an abandoned escrow account holding $14.2M. Contact me privately with your passport to claim funds as next of kin."),
]

# Expand dataset with realistic variations to provide ~100 balanced examples
variations_ham = [
    ("ham", "Meeting Rescheduled: Sprint Review to 4 PM", "Hi team, the sprint review has been pushed by one hour to accommodate our west coast engineers. The new Google Meet invite is updated."),
    ("ham", "Code Review Feedback: SQLite Repository", "Thanks for submitting the database persistence layer PR. Everything compiles and passes tests. Please add an index on prediction timestamp."),
    ("ham", "Quarterly Cloud Cost Optimization Summary", "We successfully cut AWS compute expenses by 14% this quarter by converting batch jobs to spot instances. Detailed breakdown attached in PDF."),
    ("ham", "Draft Syllabus: Intro to Natural Language Processing", "Colleagues, please find attached the draft syllabus for the Fall NLP elective. It covers n-gram tokenization, TF-IDF, naive bayes, and transformer models."),
    ("ham", "Student Attendance List for Lab 3", "Hi TA, please verify the attendance records for yesterday's machine learning lab session before entering grades in the university portal."),
    ("ham", "Security Alert: New SSH Key Added to Server", "Notification: A new public SSH key was authorized for user deploy on staging-web-01. If this was not performed by your team, investigate immediately."),
    ("ham", "Lunch and Learn: Interpretable Machine Learning", "Join us in conference room A this Friday at noon for a tech talk on interpreting feature selection and Shapley values in NLP models."),
    ("ham", "Hardware Requisition Status Update", "Your order for the 32GB RAM upgrade has been received by IT support. Bring your laptop to room 210 on Wednesday for installation."),
    ("ham", "Conference Paper Accepted: IEEE BigData 2026", "Congratulations! Our paper 'Chi-Square Statistical Testing for High-Dimensional Sparse Text Classification' has been accepted for oral presentation."),
    ("ham", "Office Supplies Restocked", "The stationery cabinet in building 4 has been restocked with notebooks, pens, sticky notes, and whiteboard markers."),
    ("ham", "Weekly Engineering Metrics Summary", "Last week our API handled 4.2 million requests with 99.98% uptime and average latency of 48ms. No critical errors reported."),
    ("ham", "Doctor Follow-up Laboratory Results", "Dear patient, your routine annual blood panel results are normal. You may view the complete laboratory report securely on your MyChart portal."),
    ("ham", "Invitation: Faculty Senate Meeting", "The monthly faculty senate meeting will convene on Wednesday at 2:00 PM in the alumni auditorium. Agenda items include student research funding."),
    ("ham", "GitHub Actions Workflow Failed: linting error", "Workflow 'oxlint check' failed on commit 12ef90: trailing whitespace found in src/ml/statistics.py. Please fix and push again."),
    ("ham", "Campus Recreation Center Hours", "The university sports and recreation center will operate on modified summer hours beginning June 1st. Lap swim lanes remain open 6 AM - 8 PM."),
    ("ham", "Software License Renewal: JetBrains IDEs", "Academic license keys for PyCharm Professional and WebStorm have been distributed. Valid through next academic year."),
    ("ham", "Code Quality Gate Passed: ProbMail Backend", "Automated code coverage reached 92.4% with all unit tests passing. Ready for staging deployment."),
    ("ham", "Feedback on ML Architecture Diagram", "The Mermaid architecture diagram clearly explains the data flow from CSV upload to Chi-Square selector and Naive Bayes pipeline."),
    ("ham", "Coffee Tasting Club Meeting", "The campus coffee enthusiasts club is meeting this Thursday at 5 PM at Roast & Brew. Sample Ethiopian and Colombian single origins."),
    ("ham", "Reminder: Submit Semester Course Evaluations", "Students are encouraged to complete anonymous course evaluations before the final exam period closes next week.")
]

variations_spam = [
    ("spam", "URGENT: Your PayPal Account Has Been Temporarily Restricted!", "We detected irregular credit card activity on your account. To lift limitations and restore full access, confirm your card details here: http://paypal-identity-check-portal.com/login"),
    ("spam", "YOU WON! Official Apple Sweepstakes Notification", "Your email address was selected in our mobile user raffle to receive a free $1,000 Apple Store Gift Card. Click here immediately to claim: http://apple-giftcard-claims.biz"),
    ("spam", "Cryptocurrency Investment Guaranteed 10x Return!", "Earn passive income with our AI-powered cryptocurrency trading system. Deposit $100 and withdraw $1,000 tomorrow. Risk-free profit! Register: http://crypto-profit-ai-bot.com"),
    ("spam", "Immediate Action: Your Amazon Order #402-9912 Has Been Delayed", "Your order of Apple MacBook Pro ($1,899.00) is held due to billing verification error. Click http://amazon-order-verification-update.org to update payment or cancel."),
    ("spam", "Pre-approved Loan of $75,000 With Zero Interest for 12 Months", "Get quick cash now! No background check, no collateral, instant approval into your checking account. Apply online in 2 minutes: http://instant-loans-fast-cash.info"),
    ("spam", "Urgent Wire Transfer Request from CEO", "I am currently traveling with limited connectivity. Please execute an urgent wire payment of $24,500 to vendor account attached. Treat with utmost confidentiality."),
    ("spam", "IRS Final Notice: Tax Debt Forgiveness Program", "You qualify for our 2026 federal tax relief initiative. Reduce your owed tax debt by up to 90%. Call 1-800-TAX-HELP or register at http://irs-tax-debt-forgive.net"),
    ("spam", "Weight Loss Miracle: Lose 20 Pounds in 14 Days!", "Discover the revolutionary keto gummy secret doctors don't want you to know about. 100% natural, no diet or exercise needed. Order trial bottle: http://keto-miracle-burn.com"),
    ("spam", "DHL Express: Package Exception - Custom Fees Unpaid", "Your parcel is on hold at our regional sorting facility. Pay customs handling fee of $2.50 to schedule delivery: http://dhl-express-parcel-delivery.biz/pay"),
    ("spam", "Exclusive Adult Dating: Local Singles Want You", "Bored tonight? Meet attractive ladies in your neighborhood looking for casual hookups. 100% private and confidential. Join free: http://meet-local-ladies-tonight.com"),
    ("spam", "Microsoft Account Alert: Unusual Sign-in Detected", "A sign-in attempt from IP 192.241.18.2 (Lagos, Nigeria) was detected. If this was not you, verify your Microsoft account security credentials now: http://msft-security-verify.net"),
    ("spam", "Final Warning: Your Computer Is Infected With 3 Viruses!", "Windows Security Alert: Trojan spyware detected on your hard drive. Your banking passwords and photos may be compromised. Call Microsoft Support: 1-888-555-0199 immediately."),
    ("spam", "Earn $300 an Hour Taking Online Surveys!", "Companies want your opinion and are willing to pay cash. Get paid directly via PayPal for each 10 minute survey you complete. Join now: http://survey-cash-rewards-daily.com"),
    ("spam", "Inheritance Claim: Deceased Relative Estate", "I am a high court attorney in Madrid. A late client sharing your surname left $16.5M in unallocated assets. Partner with me to claim funds as legitimate heir."),
    ("spam", "Congratulations! Claim Your Free Walmart $250 Gift Voucher", "You are customer #891 chosen for our annual customer appreciation reward. Click link to confirm receipt and download barcode: http://walmart-voucher-free.club"),
    ("spam", "Urgent Overdue Invoice INV-4890 - Action Required", "Your account with Global Services is overdue by $3,450. Open the attached file Invoice_PastDue.pdf.exe to inspect charges or dispute."),
    ("spam", "Buy Prescription Drugs Online Without RX!", "Generic Viagra 100mg and Cialis 20mg at 80% off retail pharmacy prices. Free airmail shipping on all bulk orders: http://rx-pharmacy-direct-sale.net"),
    ("spam", "Your Netflix Subscription Will Cancel Today", "We could not renew your monthly streaming plan with your card ending in 8112. Click here to prevent cancellation and service disruption: http://netflix-account-restart.com"),
    ("spam", "Exclusive Invitation: Secret Wealth Creation Summit", "Join 5 billionaire investors revealing the secret wealth generation strategy for 2026. Free live webinar link for the first 50 attendees: http://secret-wealth-summit.info"),
    ("spam", "Google Drive: File Shared with You 'Confidential_Bonus.xlsx'", "A user shared an encrypted spreadsheet with you. To authenticate and decrypt your view, log in with your email credentials at http://gdrive-shared-doc-auth.com")
]

all_data = emails + variations_ham + variations_spam

df = pd.DataFrame(all_data, columns=["label", "subject", "body"])
# Also provide combined text column
df["text"] = df["subject"] + " - " + df["body"]

os.makedirs("data", exist_ok=True)
os.makedirs("backend/data", exist_ok=True)
df.to_csv("data/sample_dataset.csv", index=False)
df.to_csv("backend/data/sample_dataset.csv", index=False)
print(f"Generated sample dataset with {len(df)} records. Ham: {(df['label'] == 'ham').sum()}, Spam: {(df['label'] == 'spam').sum()}")
