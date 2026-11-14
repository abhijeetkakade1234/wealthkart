# WealthKart app guide

WealthKart is a phone app for our savings group. Members use it to pay their monthly installment and loan interest, to ask for loans, and to see how the fund is growing. Admins use it to check payments and run the group.

Every payment is still made the usual way, into the group's **group bank account**. The app is where you tell the group you've paid. An admin checks the money arrived and approves it, and it's then written into our **Google Sheet** automatically.

> The app is being tested now. The screens and rules below are how it works today; some details may change before everyone starts using it.

---

## 1. Who does what

| Role            | Who                   | What they can do                                                                                                                                                                  |
| --------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Super admin** | Member 01             | Everything admins can do, plus: create admins, change the loan interest rule (rule 15), link the Google Sheet, create new groups, set a loan's tenor start                        |
| **Admins**      | Member 02, Member 12  | Approve or reject payments and loan requests, record payments for members, waive late fees, add bank interest or charges, change group settings, add member logins and reset PINs |
| **Members**     | Everyone in the group | Pay, ask for loans, see their own payments, see everyone's loans, see the group's analytics                                                                                       |

Admins and the super admin are members too: they pay and borrow like everyone else.

---

## 2. Getting started

### Signing in

- Open the app link the super admin sends you.
- Sign in with your **mobile number** and a **6-digit PIN**. There's no OTP.
- The admin gives you a starting PIN. The first time you sign in, the app asks you to choose your own.
  - It can't be an easy PIN like `111111`, `123456` or `654321`.
- You stay signed in on your phone for 60 days.
- **Wrong PIN 5 times** locks your login for 15 minutes. If you forget your PIN, ask an admin to reset it.

### Installing it on your phone

It installs like an app, with no app store needed:

- **Android (Chrome):** tap **Install app** when it's offered, or use the browser menu ▸ **Install app**.
- **iPhone (Safari):** tap **Share ▸ Add to Home Screen**.

### Finding your way around

The bar at the bottom of the screen has: **Home · Pay · Loans · Analytics · Profile**. Admins also have **Admin**.

If you're in more than one WealthKart group, use the group name at the top to switch between groups.

---

## 3. For members

### Home

Shows what you owe this month:

- your **installment** and whether it's due, waiting for approval, or paid;
- **interest** on your loan, if you have one;
- any **late fees**.

If you missed a month, Home tells you and links straight to paying for it.

### Paying

1. Pay into the group's group bank account. The **Pay** screen has an **Open UPI app** button with the amount filled in, plus the UPI ID and bank details to copy.
2. On the **Pay** screen, choose what you're paying for:
   - **Monthly installment** (tick box);
   - **Loan interest**;
   - **Loan repayment** (to reduce your loan);
   - **Late fee**, if you have one.
3. Optionally add the **UPI / bank reference** (the 12-digit UTR) and a **screenshot** of the payment. Both help the admin find your payment quickly.
4. Tap **I've paid**. The payment is now _waiting for approval_. You get an alert when an admin approves it, or rejects it with the reason.

You can **withdraw** a payment while it's still waiting, for example if you entered the wrong amount.

#### Paying together or separately

You can pay everything in one go, or send each part on its own: untick or clear what you're not paying now.

| What               | Can it be paid in parts?                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| **Installment**    | **No.** It's paid in full (e.g. ₹4,000), but it can be paid separately from interest.             |
| **Loan interest**  | **Yes.** Any amount up to what's due. The app shows what's left, e.g. "₹1,000 left for Dec 2026". |
| **Loan repayment** | **Yes.** Any amount at any time, up to what you owe.                                              |
| **Late fee**       | **No.** Each fee is paid whole (₹100, or ₹200 for two).                                           |

The app won't accept:

- payments for **future months** (no advance payments);
- more interest or late fees than you owe;
- a repayment larger than your loan;
- a second payment of the same month's installment.

### Loans

The **Loans** screen shows **every member's loans**: who owes how much, at what rate, and the monthly interest. The whole group can see where the money is.

To borrow:

1. Tap **Ask for a loan**, enter the amount and reason, and choose **Regular** or **Medical emergency**.
2. An admin reviews it, sends the money to you, then approves it in the app.
   - Approving records the date the money was sent and writes the loan into the sheet.

Limits:

- A loan request must be at least ₹1,000.
- There's a maximum one member can owe in total. It's ₹5,00,000 today; admins can change it.
- You can only have one loan request waiting at a time. You can withdraw it while it's waiting.

### Alerts

The bell at the top shows alerts. For example:

- your installment is due;
- a late fee was added;
- your payment was approved;
- your loan rate is about to change.

When the app is open on your phone, these can also show as phone notifications.

### Profile

Change your PIN, install the app, or sign out.

---

## 4. How the money is calculated

### Installment

- The monthly installment is a fixed amount set by the admins (₹4,000 today).
- It **only changes when an admin changes it** in Settings. It never goes up automatically.
- It's due by the **10th** of each month.

### Late fees (rules 6–8)

- Not paid by the 10th: **₹100** late fee from the 11th.
- Still not paid after the 20th: **another ₹100** from the 21st (₹200 in total).
- Admins can **waive** a late fee, but must give a reason.

### Loan interest

- **Interest starts the month after you get the money.**
  - Example: a loan sent on 15 March pays its first interest for April.
- **Each month's interest is on what you owed at the start of that month.**
  - So repaying part of your loan in the middle of a month doesn't reduce _that_ month's interest; the lower amount counts from the next month.
  - Paying a loan off completely still leaves that month's interest to pay.
- **A repayment only ever reduces your own loan.**
  - If you have two loans, it goes to the loan you choose first, then to your oldest loan.
  - When a loan reaches ₹0 it closes automatically.

**Example.** You owe ₹2,00,000 at 1% a month. In December you pay ₹4,000 installment + ₹2,000 interest + ₹50,000 repayment.

|                       | Before                | After approval           |
| --------------------- | --------------------- | ------------------------ |
| Your loan             | ₹2,00,000             | ₹1,50,000                |
| December interest     | ₹2,000 (on ₹2,00,000) | paid                     |
| January interest      | –                     | ₹1,500 (1% of ₹1,50,000) |
| Everyone else's loans | unchanged             | unchanged                |

### Rule 15: rising interest in 6-month tenors

When the super admin switches this rule on, loans run in **tenors of 6 months**:

| Months after you get the loan | Rate a month                                  |
| ----------------------------- | --------------------------------------------- |
| 1 to 6 (tenor 1)              | 1%                                            |
| 7 to 12 (tenor 2)             | 1.5%                                          |
| 13 to 18 (tenor 3)            | 2%                                            |
| After 18                      | No further extension: the loan must be repaid |

- **Repay and take it again:** if you repay at the end of a tenor and take the loan again, an admin presses **Start a new tenor**. Your loan goes back to tenor 1 (1%) from the next month.
- **Alerts:**
  - a month before a tenor ends, you're told how much to repay to restart at 1%;
  - when a new tenor starts, you're told the new rate;
  - if a loan goes past the last tenor, both you and the admins are told.
- **Your loan card** shows where you are, e.g. "1.5% a month · tenor 2 of 3, 2 months left, then 2%".

The tenor length, the rates and the month the rule starts from can all be changed by the super admin. Loans taken before the rule started keep their own rate unless the super admin includes them.

### Medical emergency loans (rule 18)

- Up to **₹1,00,000**.
- **No interest** for the month it's sent and the next two. Example: sent on 2 December, there's no interest for December, January or February; interest starts in March at the normal rate.

### Fund figures on the Analytics page

| Figure                | What it means                                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Paid in**           | All installments members have paid since the group started                                                                  |
| **Current value**     | Paid in + loan interest earned from members + bank interest, minus bank charges, fees and taxes                             |
| **Gain**              | Current value − paid in                                                                                                     |
| **Annual return**     | The fund's yearly return, taking into account _when_ each installment was paid (an XIRR). About 9.2% a year as of Nov 2026. |
| **Lent out**          | Total all members owe on their loans right now                                                                              |
| **Cash**              | Money in the bank account (paid in + bank entries + loan repayments and interest − loans sent − UTI investment)             |
| **Reserve**           | 20% of the fund value kept back, never lent (rule 12)                                                                       |
| **Available to lend** | Cash − reserve                                                                                                              |

Cash + UTI + loans lent out always add up to the current value. The app checks this.

---

## 5. For admins

Tap **Admin** in the bottom bar. Swipe the row of tabs to see them all.

### Approvals

- **Payments to check:** tap a payment to see the amounts, reference number and screenshot. Check the money is in the group bank account, then:
  - **Approve:** the payment is written into the Google Sheet, the member's loan goes down if they repaid, and the member gets an alert;
  - **Reject:** you must give a reason, and the member sees it.
- **Record a payment:** for a member who paid but doesn't use the app, or paid in cash.
  - Pick the member and month; the form fills in what they owe.
  - It goes through the same checks as a member's payment.
  - It's **approved straight away**, so check the money arrived first. It's marked "Recorded by (your name)".
- **Loan requests:** review the request, send the money, then approve it with the date sent, the rate and the bank reference.

### Collection

- This month's status for every member: **paid**, **waiting**, **due**, or **in the sheet** (for months before the app started).
- Members without an app login also appear here, marked "No app login".
- Every unpaid member has a **Record** button.
- **Run reminders now** does the morning check straight away (see section 7).

### Members

- Add a login for a member: name, mobile, starting PIN.
- Reset a PIN, or switch a login off.
- Only the super admin can make someone an admin.

### Late fees

See every late fee. **Waive** one (with a reason) or add one by hand.

### Loans

All open loans, with each one's rate, monthly interest and tenor. Tap a loan to:

- change its rate (when the tenor rule isn't covering it);
- **Start a new tenor**, when the member repaid at the end of a tenor and took the loan again;
- **Mark as fully repaid**, if the member paid it back outside the app.
  - This records the repayment in the sheet, so the books still add up.

**Record a loan** is for money already sent without a request in the app.

### Fund

Add bank entries:

| Entry          | Effect                             |
| -------------- | ---------------------------------- |
| Bank interest  | Added to the fund                  |
| Other credit   | Added to the fund                  |
| Bank charge    | Taken from the fund                |
| Tax            | Taken from the fund                |
| UTI investment | Moves money from the bank into UTI |

### Activity

A log of who did what and when: approvals, setting changes, PIN resets.

---

## 6. Settings (Admin ▸ Settings)

Change the values and press **Save settings** at the bottom.

| Section                      | Setting                                           | Today                      | Who can change it    |
| ---------------------------- | ------------------------------------------------- | -------------------------- | -------------------- |
| Group                        | Group name                                        | WealthKart G1              | Admins               |
| Installments and late fees   | Monthly installment                               | ₹4,000                     | Admins               |
|                              | Yearly increase                                   | ₹1,000                     | Admins               |
|                              | Due day                                           | 10th                       | Admins               |
|                              | Late fee after the due day                        | ₹100                       | Admins               |
|                              | Second late fee after day                         | 20th                       | Admins               |
|                              | Second late fee                                   | ₹100                       | Admins               |
| Loans                        | Most one member can owe                           | ₹5,00,000                  | Admins               |
|                              | Interest % a month                                | 1%                         | Admins               |
|                              | Reserve kept back                                 | 20% of the fund            | Admins               |
| Loan interest rule (rule 15) | Apply the tenor rule                              | Off                        | **Super admin only** |
|                              | Months in each tenor                              | 6                          | **Super admin only** |
|                              | Rate for each tenor                               | 1, 1.5, 2                  | **Super admin only** |
|                              | Applies to loans taken or renewed from            | the month it's switched on | **Super admin only** |
| Paying in                    | bank UPI ID, name shown in UPI apps, bank details | –                          | Admins               |
|                              | Also email reminders                              | Off                        | Admins               |
| Google Sheet                 | Spreadsheet, tab names, app start month           | –                          | **Super admin only** |

Good to know:

- **Yearly increase** is only used to draw the 30-year projection on the Analytics page. It does **not** raise anyone's installment. To raise the installment, change **Monthly installment**, ideally at the start of a month, before anyone has paid.
- **Rule 15** is greyed out for admins; only the super admin can switch it on or change it.
- **Per-loan settings** (super admin, in Admin ▸ Loans ▸ tap a loan ▸ _Tenor rule for this loan_):
  - **Tenor start:** brings a loan from before the rule under it, counting from the date the money was sent.
  - **Keep this loan's own rate:** leaves one loan outside the rule.

---

## 7. Reminders (automatic, every morning around 7 am)

| Day                        | What happens                                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **5th**                    | Members who haven't paid get a reminder. Admins get a list of who hasn't paid.                                   |
| **10th** (due day)         | "Last day to pay" reminder to anyone still unpaid, and a list for admins.                                        |
| **11th**                   | ₹100 late fee added for anyone still unpaid, with an alert.                                                      |
| **21st**                   | Another ₹100 late fee for anyone still unpaid.                                                                   |
| Any day (if rule 15 is on) | Alerts when a loan moves to its next tenor, a month before a tenor ends, and when a loan is past its last tenor. |

Running the check twice never adds a reminder or late fee twice. Members without an app login don't get alerts, but they appear on the admins' list.

Alerts show inside the app, and as phone notifications when the app is opened. Turning on **Also email reminders** in Settings sends them by email too.

---

## 8. What goes into the Google Sheet

When an admin approves a payment or a loan, the app writes it into the same tabs we use today:

| What happened                          | Where it goes                                                                                       |
| -------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Installment paid                       | `1` in the member's column for that month, in the **WealthKart G1** tab                             |
| Interest and repayments                | Added to the member's cell for that month in the **Debit** tab, with a note in the Comments columns |
| Loan sent                              | Subtracted in the member's cell in the **Debit** tab                                                |
| Late fees, bank interest, charges, tax | **Credits/ Deductions** column                                                                      |
| UTI investment                         | **UTI Investment** column                                                                           |
| A new month (e.g. January 2027)        | The app adds the row and updates the totals and the Summary tab                                     |

Months before the app's start month stay exactly as they are in the sheet, and can't be paid again through the app.

---

## 9. Privacy and safety

- PINs are never stored as typed; the app keeps only a scrambled version (a salted hash).
- Payment screenshots are stored privately in the group's Google Drive. Only admins and the member who paid can see them.
- The Google Sheet should stay **restricted**, not open to "anyone with the link", because it has members' bank and contact details.
- The app runs free on Google's services: Google Sheets, Google Drive and Google Apps Script.

---

## 10. Questions

**I paid but forgot to send it in the app. What now?**
Send it now on the Pay screen for the right month, or ask an admin to record it for you.

**I paid the wrong amount.**
If it's still waiting for approval, withdraw it and send it again. If it was approved, talk to an admin.

**Can I pay next month's installment early?**
No. Payments for future months aren't allowed.

**Why is my interest the same even though I repaid part of my loan this month?**
Interest is on what you owed at the start of the month. Your lower loan counts from next month.

**Can someone see my loan?**
Yes. Every member can see every loan and its status. That's the group's rule, so everyone knows where the money is.

**I don't want to use the app.**
That's fine. Pay into the group bank account as usual and tell an admin; they'll record it for you.

---

## 11. Not in the app yet (being discussed)

- **Rule 13 (maximum loan of 40% of the fund):** today the limit is a fixed amount set by admins.
- **Rule 17 (a full month's interest even if a loan is held less than 30 days):** not enforced yet. A loan sent and repaid in the same month currently pays no interest.
- **Medical loan limits:** the ₹1,00,000 limit and the free months can't be changed in Settings yet, and the once-a-year limit isn't checked.
- **Guarantors (rule 11):** the group decided the app doesn't need guarantor approval.
- **Phone alerts when the app is fully closed:** these would need a paid service. Email reminders are the free alternative.
