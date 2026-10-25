export interface RawEmailRow {
  label: 'ham' | 'spam';
  subject: string;
  body: string;
  text?: string;
}

export const SAMPLE_EMAILS: RawEmailRow[] = [
  {
    label: 'ham',
    subject: "Q3 Engineering Sprint Retrospective Notes",
    body: "Hi team, thanks everyone for joining today's sprint retrospective. The action items and Jira ticket links are compiled on Confluence. Let's make sure code reviews are completed before Wednesday.",
  },
  {
    label: 'ham',
    subject: "Quarterly Budget Planning for Dev Team",
    body: "Hello Sarah, please find attached the draft figures for our server infrastructure budget for Q4. Cloud compute usage decreased by 8% due to our database indexing optimizations.",
  },
  {
    label: 'ham',
    subject: "Code Review: PR #342 - Refactor Chi-Square Feature Selector",
    body: "Hi Alex, I reviewed your pull request. The vectorizer caching looks great, but could you please add a unit test checking edge cases where vocabulary count is smaller than k?",
  },
  {
    label: 'ham',
    subject: "Lunch Catchup Tomorrow?",
    body: "Hey Mark, are we still on for lunch tomorrow at 12:30? Let me know if the campus cafe works or if you prefer the deli downstairs.",
  },
  {
    label: 'ham',
    subject: "Weekly Department All-Hands Agenda",
    body: "Good morning all, our department all-hands meeting will be held at 3:00 PM EST via Google Meet. Topics include quarterly milestones, new team member introductions, and product roadmap updates.",
  },
  {
    label: 'ham',
    subject: "Customer Support Ticket #89211 Resolution",
    body: "Dear customer, your request regarding API key rate limits has been resolved. We have increased your tier quota to 5,000 requests per minute as requested.",
  },
  {
    label: 'ham',
    subject: "GitLab CI/CD Pipeline Succeeded: master branch",
    body: "Pipeline #9812 for commit 4f8a291 on branch master succeeded in 4m 12s. All 48 unit and integration tests passed without warnings.",
  },
  {
    label: 'ham',
    subject: "Research Seminar: Probabilistic Models in Cybersecurity",
    body: "Reminder: Professor Chen's seminar on Bayesian text classification and feature selection is scheduled for Thursday at 4 PM in Hall B. Refreshments will be served.",
  },
  {
    label: 'ham',
    subject: "Invoice Receipt: GitHub Enterprise Cloud Subscription",
    body: "Thank you for your payment. Your receipt for invoice #GH-908231 is attached. Amount charged: $140.00. Payment method: Corporate Visa ending in 4192.",
  },
  {
    label: 'ham',
    subject: "Draft Paper Feedback: Naive Bayes vs Gradient Boosted Trees",
    body: "Hi David, I read through the methodology section of your draft. The Chi-Square comparison is very thorough. I suggested some minor grammatical edits in the shared Overleaf document.",
  },
  {
    label: 'ham',
    subject: "Server Maintenance Window Notification: Sunday 02:00 UTC",
    body: "Notice from DevOps: Routine kernel upgrades and security patches will be applied to our staging and production clusters on Sunday between 02:00 and 04:00 UTC. Brief intermittent downtime may occur.",
  },
  {
    label: 'ham',
    subject: "Project ProbMail: Architecture Review Meeting",
    body: "Hi team, please find the updated architecture diagram and data flow specification attached for tomorrow's review with the stakeholders. Focus areas: preprocessing and model serialization.",
  },
  {
    label: 'ham',
    subject: "Invitation: Machine Learning Reading Group Discussion",
    body: "This week we are discussing 'Feature Selection for Text Categorization on Imbalanced Data' by Forman. Meeting link is in the calendar invite.",
  },
  {
    label: 'ham',
    subject: "Expense Report #EX-4019 Approved",
    body: "Your travel expense report for the IEEE conference has been approved by management and submitted to payroll for processing in the upcoming cycle.",
  },
  {
    label: 'ham',
    subject: "Frontend TypeScript Migration Update",
    body: "Team, the TypeScript migration for the user settings module is 90% complete. Please avoid modifying files in src/legacy until the merge is completed tonight.",
  },
  {
    label: 'ham',
    subject: "Office Parking Permit Renewal Form",
    body: "All employees requiring parking access for the next academic year must submit the renewal form to Facilities by Friday at 5:00 PM.",
  },
  {
    label: 'ham',
    subject: "AWS Billing Alert: Current Month Forecast",
    body: "This is an automated alert from AWS Budgets. Your forecasted monthly spend of $420 is within your target threshold of $500. No action required.",
  },
  {
    label: 'ham',
    subject: "Internship Mentorship Check-in",
    body: "Hi Kevin, let's schedule our 1-on-1 for Friday at 11 AM to discuss your progress on the SQLite storage adapter and testing suite.",
  },
  {
    label: 'ham',
    subject: "Library Notice: Book Return Due in 3 Days",
    body: "Your borrowed item 'Pattern Recognition and Machine Learning' is due for return on Monday. You may renew online through the portal if no other holds are placed.",
  },
  {
    label: 'ham',
    subject: "Database Migration Complete",
    body: "The PostgreSQL schema migration to version 2.4.0 completed successfully in 12 seconds with zero failed migrations. Staging services are back online.",
  },
  {
    label: 'ham',
    subject: "Python 3.13 Upgrade Compatibility Notes",
    body: "Devs, please note that we are upgrading virtual environments to Python 3.13. Check that your local packages match the pinned requirements.txt before committing.",
  },
  {
    label: 'ham',
    subject: "Design System Component Guidelines",
    body: "Hi designers, the updated dark navy and slate color tokens for our security SaaS dashboard have been published to Figma. Please review the button contrast ratios.",
  },
  {
    label: 'ham',
    subject: "Conference Registration Confirmation: KDD 2026",
    body: "Thank you for registering for KDD 2026. Your registration confirmation number is KDD-89012. We look forward to your attendance in August.",
  },
  {
    label: 'ham',
    subject: "API Documentation Feedback",
    body: "The updated OpenAPI 3.0 documentation for the /api/predict and /api/analytics endpoints is now live on our developer portal. Please test the sandbox examples.",
  },
  {
    label: 'ham',
    subject: "Holiday Schedule and Office Closure",
    body: "Please note that the university campus and research labs will be closed next Monday in observance of the public holiday. Regular hours resume on Tuesday.",
  },
  {
    label: 'ham',
    subject: "Code Quality Report: Static Analysis Results",
    body: "SonarQube analysis completed for commit 89ab31: 0 vulnerabilities, 0 bugs, 94.2% test coverage. Quality gate passed.",
  },
  {
    label: 'ham',
    subject: "Doctor's Appointment Reminder",
    body: "This is a reminder of your upcoming appointment with Dr. Henderson on Wednesday at 10:30 AM. Please arrive 10 minutes early to complete check-in.",
  },
  {
    label: 'ham',
    subject: "Security Vulnerability Scan: Clean Report",
    body: "Weekly vulnerability scan report: No critical or high CVEs detected across container images. Container registry scanned 18 images.",
  },
  {
    label: 'ham',
    subject: "Flight Itinerary: SFO to ORD",
    body: "Your United Airlines booking confirmation is 8U9K2L. Flight 1402 departs SFO at 08:15 AM on October 14. Terminal 3, Seat 12B.",
  },
  {
    label: 'ham',
    subject: "Software License Renewal Notice: JetBrains",
    body: "Your JetBrains student/academic license pack has been automatically renewed for another calendar year. Access is active on all tools.",
  },
  // SPAM SAMPLES
  {
    label: 'spam',
    subject: "URGENT: Your Bank Account Has Been Suspended!",
    body: "Dear Customer, We detected unauthorized login attempts on your online banking account. To prevent permanent suspension, you must verify your identity immediately by clicking here: http://secure-bank-login-verify-account.com/action. Failure to verify within 24 hours will result in asset freeze.",
  },
  {
    label: 'spam',
    subject: "CONGRATULATIONS! You Have Won $1,000,000 in the International Lottery!",
    body: "You have been selected as the grand prize winner of $1,000,000 in our annual sweepstakes draw! Claim your cash prize now by sending your full name, phone number, address, and bank account details to claims@cash-lottery-promo.org.",
  },
  {
    label: 'spam',
    subject: "Exclusive Crypto Investment: 500% Guaranteed ROI in 7 Days!",
    body: "Do not miss out on this automated Bitcoin and crypto trading bot! Guaranteed daily returns of 15% with zero risk. Deposit minimum $250 today and watch your wealth multiply. Click http://crypto-billionaire-guarantee.biz to invest now!",
  },
  {
    label: 'spam',
    subject: "Claim Your $500 Amazon Gift Card Now!",
    body: "Congratulations valued shopper! You were chosen to receive a free $500 Amazon gift voucher. Click the link below and complete a short 1-minute survey to receive your instant digital claim code: http://free-giftcard-rewards2026.net",
  },
  {
    label: 'spam',
    subject: "Immediate Action Required: Microsoft 365 Password Expiration Alert",
    body: "Your Microsoft 365 work email password will expire in 2 hours. To maintain access and keep your current password, verify your credentials here: http://office365-login-update-security-portal.com/auth. Failure to update will lock your mailbox.",
  },
  {
    label: 'spam',
    subject: "Pre-approved Unsecured Loan Offer: Up to $50,000 Fast Cash",
    body: "Bad credit? No problem! Get instant pre-approval for up to $50,000 cash loan directly deposited to your bank account within 2 hours. No credit check required! Apply now: http://fast-cash-lenders-now.info/apply",
  },
  {
    label: 'spam',
    subject: "URGENT Invoice Attached: Overdue Payment Notice #INV-9921",
    body: "Dear Accounts Payable, Your invoice #9921 is 45 days past due. Please open the attached remittance macro file invoice_overdue.docm or click http://pay-invoice-direct.ru/download to settle your balance before legal action is initiated.",
  },
  {
    label: 'spam',
    subject: "Cheap Pharmacy: Viagra, Cialis, and Levitra with No Prescription!",
    body: "Buy generic medications online at 90% discount! No doctor prescription needed. Fast discreet worldwide shipping with free bonus pills on all orders over $60. Order online today: http://cheap-meds-express-rx.com",
  },
  {
    label: 'spam',
    subject: "Confidential Business Partnership: $25.5 Million Transfer",
    body: "I am Barrister Williams representing the estate of a deceased client. I am seeking your trustworthy assistance to transfer $25,500,000 into your foreign bank account. You will receive 40% of the total funds as commission. Reply urgently.",
  },
  {
    label: 'spam',
    subject: "IRS Notice: Unclaimed Tax Refund of $3,450.00",
    body: "Internal Revenue Service tax refund notification: We have processed your annual tax return and calculated an unclaimed refund of $3,450.00. Submit your SSN, banking info, and date of birth at http://irs-tax-refund-portal.gov.fake-irs-web.com to claim.",
  },
  {
    label: 'spam',
    subject: "FedEx Delivery Alert: Package Pending - Address Missing",
    body: "FedEx Tracking: Your shipment could not be delivered due to an incorrect home address. To update your delivery address and pay the $1.99 redelivery fee, visit: http://fedex-parcel-tracking-update.xyz/reschedule",
  },
  {
    label: 'spam',
    subject: "PayPal Security Alert: Suspicious Transaction Detected",
    body: "We noticed an unauthorized charge of $849.00 to Apple Store on your PayPal account. If you did not make this purchase, click here immediately to dispute the charge and protect your account: http://paypal-resolution-center-dispute.biz",
  },
  {
    label: 'spam',
    subject: "Earn $5,000/Week Working From Home! No Experience Required",
    body: "Work from home part-time and earn $500 to $1,000 daily! We supply full training and materials. Only 2 hours per day required. Limited spots available for your city. Register today at http://work-from-home-careers-now.org",
  },
  {
    label: 'spam',
    subject: "Hot Singles in Your Area Want to Chat Tonight!",
    body: "Meet local singles looking for discreet dating tonight! 100% anonymous, free registration, thousands of verified profiles online right now. Click here to browse photos: http://local-dating-singles-fun.com",
  },
  {
    label: 'spam',
    subject: "Netflix Account Suspended: Billing Information Invalid",
    body: "We were unable to process your monthly Netflix subscription payment. Your membership has been put on hold. Please update your credit card details immediately at http://netflix-billing-update-center.cc/login to continue watching.",
  },
  {
    label: 'spam',
    subject: "URGENT: Cease and Desist Copyright Infringement Notice",
    body: "You are illegally hosting copyrighted images on your website without a commercial license. View the list of infringing image URLs and legal settlement demands here: http://copyright-infringement-case-files.ru/doc.zip",
  },
  {
    label: 'spam',
    subject: "Congratulations! You won a brand new Apple iPhone 16 Pro!",
    body: "You are today's lucky visitor selected to receive a free Apple iPhone 16 Pro (256GB). Confirm your shipping address and pay only $1.00 postage: http://iphone16-free-rewards-promo.club",
  },
  {
    label: 'spam',
    subject: "Wire Transfer Confirmation: $18,400.00 Pending Approval",
    body: "CEO Emergency Request: I am in a board meeting and cannot take calls. I need you to immediately execute an urgent wire transfer of $18,400.00 to our vendor's new bank account details below. Confirm once completed.",
  },
  {
    label: 'spam',
    subject: "Apple ID Security: Your Account Has Been Locked",
    body: "Your Apple ID was used to sign in to iCloud from an unrecognized device in Moscow, Russia. Your account is temporarily locked. Click http://appleid-apple-verify-identity.com/unlock to confirm your identity.",
  },
  {
    label: 'spam',
    subject: "Claim 100 Free Spins at Golden Palace Casino!",
    body: "Sign up today and get 100 free spins plus 300% deposit match bonus up to $2,000! Instant withdrawals, licensed jackpots, play slots and blackjack now: http://golden-palace-slots-bonus.biz",
  },
  {
    label: 'spam',
    subject: "DHL Express: Your Shipment Has Been Detained at Customs",
    body: "DHL Express notification: Parcel tracking #DH-882194 has been detained by international customs. An outstanding clearance duty fee of $4.85 must be paid to release shipment. Visit http://dhl-customs-clearance-payment.info",
  },
  {
    label: 'spam',
    subject: "Final Notice: Your Domain Registration Is About To Expire!",
    body: "Domain notification: Your domain registration will expire in 48 hours and will be released for public auction. Renew your domain now for $89 to prevent loss of service: http://domain-registry-renewal-notice.com/pay",
  },
  {
    label: 'spam',
    subject: "Increase Your Website Traffic by 10,000 Visitors a Day!",
    body: "Guaranteed SEO rankings on page 1 of Google. High quality backlinks, social media signals, and targeted web traffic. Packages start at only $29. Check our packages: http://top-seo-ranking-boosters.com",
  },
  {
    label: 'spam',
    subject: "Action Required: Suspicious Withdrawal Request on Kraken Account",
    body: "A withdrawal request for 2.45 ETH ($6,120 USD) was initiated from IP 185.220.101.5. If you did not authorize this transaction, cancel it immediately at http://kraken-security-cancel-withdrawal.cc",
  },
  {
    label: 'spam',
    subject: "Claim Your Unclaimed Settlement Funds: Class Action Lawsuit",
    body: "You are entitled to receive $1,840.00 from the tech consumer data privacy settlement fund. Deadline to file claim form is midnight tonight: http://consumer-protection-settlement-claims.org",
  },
  {
    label: 'spam',
    subject: "USPS Notice: Failure to Deliver Parcel #US-9912048",
    body: "USPS tracking: The package could not be delivered on October 23 due to an incomplete delivery address. Please verify your address and confirm $1.45 fee: http://usps-redelivery-address-confirm.com",
  },
  {
    label: 'spam',
    subject: "Security Alert: Someone accessed your Instagram account",
    body: "We noticed a login from Chrome on Windows in Tehran, Iran. If this was not you, change your password and confirm your telephone number immediately: http://instagram-checkpoint-secure-account.net",
  },
];
