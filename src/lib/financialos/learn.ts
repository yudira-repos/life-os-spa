// Finance 101 — plain-language explanations, written for someone who has
// never been taught any of this.
//
// The ask this was built from was explicit: guidance for people who aren't
// financially literate. So the rules here are:
//
//   - No jargon without defining it in the same sentence.
//   - Concrete numbers, not percentages in the abstract.
//   - Say the uncomfortable part. If a product is usually a bad deal, say so
//     and say who benefits from selling it.
//   - No condescension. Not knowing this stuff is the default state; almost
//     nobody was taught it, and the industry has very little incentive to fix
//     that.
//
// Every `learnKeys` entry on a recommendation resolves to one of these.

export interface LearnTopic {
  key: string;
  term: string;
  short: string; // one-line definition, shown inline
  body: string[]; // full explanation
  example?: string;
  related?: string[];
}

export const LEARN_TOPICS: LearnTopic[] = [
  {
    key: "emergency_fund",
    term: "Emergency fund",
    short: "Cash set aside to cover several months of essential bills if income stops.",
    body: [
      "An emergency fund is money sitting in a savings account doing nothing exciting, on purpose. Its job is to be there when the car needs a transmission or a job ends.",
      "The size is measured in months of ESSENTIAL spending — rent or mortgage, food, utilities, insurance, minimum debt payments. Not your total spending. If essentials are $4,000 a month, three months is $12,000.",
      "Three months is a reasonable floor for a two-income household. Six is standard. Twelve makes sense if income is variable or you're the only earner.",
      "It should not be invested. The stock market falls hardest during recessions, which is exactly when layoffs happen — you'd be forced to sell at the worst possible moment.",
    ],
    example:
      "Essentials of $4,000/month × 6 months = $24,000 in a high-yield savings account, earning about $960 a year while it waits.",
    related: ["high_yield_savings", "savings_rate"],
  },
  {
    key: "high_yield_savings",
    term: "High-yield savings account (HYSA)",
    short: "A normal savings account that pays real interest instead of nearly none.",
    body: [
      "Big banks commonly pay around 0.01% on savings. Online banks pay around 4%. Same FDIC insurance, same access, same safety.",
      "On $20,000 that difference is about $800 a year for filling in one online form.",
      "There's no catch and no lock-up. The money is still yours on demand. The rate moves with the Fed, so it drifts up and down over time.",
      "Keep it at a different bank from your checking account. The one or two days it takes to transfer is a useful speed bump.",
    ],
    example: "$20,000 at 0.01% earns $2/year. At 4.0%, $800/year.",
    related: ["emergency_fund"],
  },
  {
    key: "401k_basics",
    term: "401(k)",
    short: "A retirement account through your employer, funded straight from your paycheck.",
    body: [
      "You choose a percentage of your pay to divert into the account before you ever see it. In 2026 you can put in up to $24,500 of your own money.",
      "Traditional contributions come out before income tax, which lowers this year's tax bill; you pay tax when you withdraw in retirement. Roth contributions are taxed now and are never taxed again, including the growth.",
      "Many employers add a 'match' — free money, covered separately.",
      "The money is meant to stay until 59½. Taking it out earlier generally means income tax plus a 10% penalty.",
      "Critical and widely missed: putting money into a 401(k) is NOT the same as investing it. You must also choose what it buys. Left alone, many plans park it in a money market fund earning almost nothing.",
    ],
    example:
      "Earning $120,000 and contributing 15% puts $18,000 a year in, and lowers taxable income to $102,000.",
    related: ["employer_match", "roth_vs_traditional", "index_funds", "vesting"],
  },
  {
    key: "employer_match",
    term: "Employer match",
    short: "Your employer adds money to your 401(k) when you do. It is free money.",
    body: [
      "A common formula: 'we match 50% of your contributions up to 6% of pay'. If you earn $100,000 and contribute 6% ($6,000), your employer adds $3,000.",
      "Contribute less than 6% and you get proportionally less. Contribute nothing and you get nothing.",
      "That $3,000 is an immediate 50% return on your $6,000, before it's invested in anything. There is no investment on earth that reliably offers that.",
      "This is the single highest-priority move in personal finance. It comes before paying off credit card debt, before an emergency fund, before everything.",
      "Check the vesting schedule — some employers require you to stay 3-5 years before their contributions are fully yours.",
    ],
    example: "Not contributing enough to get a $3,000 match costs $3,000 a year — about $300,000 over a 30-year career once compounding is counted.",
    related: ["401k_basics", "vesting"],
  },
  {
    key: "vesting",
    term: "Vesting",
    short: "How long you must stay before your employer's contributions are actually yours.",
    body: [
      "Your own contributions are always 100% yours immediately. Your employer's may not be.",
      "Cliff vesting: nothing is yours until, say, year 3 — then all of it at once. Graded vesting: 20% per year over five years.",
      "This matters when changing jobs. Leaving two months before a cliff can forfeit thousands.",
      "It never changes the answer on whether to take the match. It only affects timing decisions around leaving.",
    ],
    related: ["employer_match"],
  },
  {
    key: "roth_vs_traditional",
    term: "Roth vs traditional",
    short: "Pay tax now (Roth) or pay tax later (traditional).",
    body: [
      "Traditional: the contribution is deducted from this year's taxable income; you pay tax on withdrawals in retirement.",
      "Roth: you pay tax now; the account grows and comes out completely tax-free, forever.",
      "The rule of thumb: if your tax rate is LOW now (early career, low income year), Roth wins. If it's HIGH now (peak earning years), traditional wins.",
      "Nobody knows future tax rates, so splitting between the two is a legitimate hedge rather than indecision.",
      "Roth has a second advantage: no required minimum distributions during your lifetime, so the money can keep growing untouched.",
    ],
    example:
      "In the 12% bracket, $7,000 in a Roth costs $840 of tax today and is never taxed again. In the 32% bracket, the same contribution costs $2,240 — traditional likely wins.",
    related: ["401k_basics", "roth_ira", "backdoor_roth"],
  },
  {
    key: "roth_ira",
    term: "Roth IRA",
    short: "A retirement account you open yourself. Tax-free growth, tax-free withdrawals.",
    body: [
      "Separate from anything your employer offers — you open it at a brokerage in about ten minutes.",
      "In 2026 you can contribute $7,500 ($8,600 if you're 50 or older), per person.",
      "Income limits apply: for 2026 the ability to contribute directly phases out between $153,000 and $168,000 (single) or $242,000 and $252,000 (married filing jointly). Above that, see the Backdoor Roth.",
      "Your CONTRIBUTIONS (not the growth) can be withdrawn at any time, for any reason, with no tax or penalty. That makes it a reasonable backup emergency reserve once your cash fund is built.",
      "You have until the April tax deadline to contribute for the prior year.",
    ],
    related: ["backdoor_roth", "index_funds", "spousal_ira"],
  },
  {
    key: "backdoor_roth",
    term: "Backdoor Roth IRA",
    short: "A legal two-step that gets money into a Roth IRA when your income is too high to contribute directly.",
    body: [
      "There's an income limit on contributing to a Roth IRA directly. There is NO income limit on converting a traditional IRA to a Roth. So: contribute to a traditional IRA (non-deductible), then convert it to Roth.",
      "This isn't a grey-area trick. Congress removed the income limit on conversions in 2010 and has left it removed ever since, with full awareness of this exact use.",
      "THE CATCH — the pro-rata rule. If you have ANY pre-tax money in a traditional, SEP, or SIMPLE IRA, the IRS treats them all as one pot and taxes your conversion proportionally. This is where people get surprise tax bills.",
      "The fix: roll existing pre-tax IRA money into your 401(k) first. 401(k) balances don't count in the pro-rata calculation.",
      "File Form 8606 with your tax return every year you do this. It's what documents that the contribution was non-deductible — skipping it risks paying tax twice on the same money.",
    ],
    example:
      "$7,500 into a traditional IRA, converted to Roth a few days later. With no other IRA money, the tax owed is essentially zero.",
    related: ["roth_ira", "pro_rata_rule", "form_8606", "mega_backdoor_roth"],
  },
  {
    key: "pro_rata_rule",
    term: "Pro-rata rule",
    short: "When you convert IRA money to Roth, the IRS taxes it in proportion to all your pre-tax IRA money.",
    body: [
      "The IRS looks at ALL your traditional, SEP, and SIMPLE IRAs combined, as of December 31, and works out what fraction is pre-tax.",
      "That same fraction of any conversion is taxable, no matter which dollars you think you converted.",
      "Example: $93,000 of pre-tax IRA money plus a fresh $7,500 non-deductible contribution = $100,500 total, 93% pre-tax. Convert $7,500 and about $6,975 of it is taxable.",
      "Workplace 401(k) balances are NOT counted. Which is why rolling an old IRA into your current 401(k) clears the way for a clean Backdoor Roth.",
    ],
    related: ["backdoor_roth", "form_8606"],
  },
  {
    key: "form_8606",
    term: "Form 8606",
    short: "The tax form that tracks non-deductible IRA contributions. Skip it and you may be taxed twice.",
    body: [
      "Filed with your tax return, it records that a traditional IRA contribution was made with already-taxed money.",
      "Without it, the IRS has no record that you already paid tax on those dollars — and taxes them again on withdrawal.",
      "It's one page. Most tax software handles it if you answer the questions about IRA contributions honestly, but check that it actually generated.",
    ],
    related: ["backdoor_roth", "pro_rata_rule"],
  },
  {
    key: "mega_backdoor_roth",
    term: "Mega Backdoor Roth",
    short: "Using after-tax 401(k) contributions to move a large extra amount into Roth each year.",
    body: [
      "The 2026 limit on YOUR 401(k) contributions is $24,500. The limit on EVERYTHING going into the account — yours, your employer's, and after-tax contributions — is $72,000.",
      "The gap between those two numbers is the opportunity. If your plan allows it, you fill it with after-tax contributions and immediately convert them to Roth.",
      "It requires two plan features: (1) after-tax (non-Roth) contributions, and (2) either in-plan Roth conversion or in-service withdrawals. Roughly half of large plans have both, and most employees never find out.",
      "Important distinction: 'after-tax' is NOT the same as 'Roth 401(k)'. They're different contribution types, listed separately in your plan. This confusion is why people are told they can't do this when they can.",
      "Convert quickly after each contribution — earnings accumulated before conversion are taxable.",
    ],
    example:
      "$24,500 elective + $10,000 employer contributions leaves about $37,500 of after-tax room. That's $37,500 a year into Roth, on top of everything else.",
    related: ["after_tax_401k", "415c_limit", "backdoor_roth"],
  },
  {
    key: "after_tax_401k",
    term: "After-tax 401(k) contributions",
    short: "A third contribution type, separate from pre-tax and Roth, that most people have never heard of.",
    body: [
      "Three types can exist in one plan: pre-tax (deducted now, taxed later), Roth (taxed now, never again), and after-tax (taxed now, earnings taxed later unless converted).",
      "After-tax on its own is mediocre. Converted to Roth, it becomes the Mega Backdoor Roth and is excellent.",
      "Ask your plan administrator this exact question: 'Does the plan permit after-tax, non-Roth contributions above the elective deferral limit, and does it allow in-plan Roth conversions?'",
    ],
    related: ["mega_backdoor_roth", "415c_limit"],
  },
  {
    key: "415c_limit",
    term: "415(c) limit",
    short: "The cap on everything that can go into your 401(k) in one year, from all sources: $72,000 for 2026.",
    body: [
      "Named after the section of the tax code. It covers your contributions, your employer's match and profit sharing, and after-tax contributions.",
      "It's per employer plan, not per person — which matters if you have two jobs with two plans.",
      "Age-50+ catch-up contributions sit on top of it rather than counting inside it.",
    ],
    related: ["mega_backdoor_roth", "401k_basics"],
  },
  {
    key: "hsa",
    term: "HSA (Health Savings Account)",
    short: "A medical savings account with the best tax treatment of any account in the US.",
    body: [
      "Requires enrollment in a high-deductible health plan. 2026 limits: $4,400 for individual coverage, $8,750 for family, plus $1,000 more if you're 55+.",
      "Tax-free going in, growing, AND coming out for medical expenses. No other account does all three.",
      "Contributed through payroll it also avoids the 7.65% FICA tax, which a 401(k) contribution does not.",
      "The advanced move: pay medical bills out of pocket, invest the HSA, and keep the receipts. There's no deadline to reimburse yourself — a receipt from today can be cashed in 30 years after the balance has grown.",
      "After 65 you can withdraw for anything, paying only ordinary income tax, like a traditional IRA. So it's never trapped.",
      "Most people leave it in cash. Invest it.",
    ],
    related: ["triple_tax_advantage", "fica"],
  },
  {
    key: "triple_tax_advantage",
    term: "Triple tax advantage",
    short: "Money goes in untaxed, grows untaxed, and comes out untaxed. Only an HSA does all three.",
    body: [
      "A traditional 401(k): untaxed in, untaxed growth, TAXED out. Two out of three.",
      "A Roth IRA: taxed in, untaxed growth, untaxed out. Two out of three.",
      "An HSA used for medical expenses: untaxed at all three stages. Given that healthcare is one of the largest expenses in retirement, this is not a narrow benefit.",
    ],
    related: ["hsa"],
  },
  {
    key: "fica",
    term: "FICA tax",
    short: "The 7.65% payroll tax for Social Security and Medicare, taken from every paycheck.",
    body: [
      "6.2% Social Security (up to $184,500 of wages in 2026) plus 1.45% Medicare (no cap). Your employer pays the same again.",
      "A 401(k) contribution does NOT avoid it. An HSA contribution made through payroll DOES.",
      "That's an extra 7.65% saving on HSA money that most comparisons leave out.",
    ],
    related: ["hsa"],
  },
  {
    key: "index_funds",
    term: "Index fund",
    short: "A fund that buys the whole market instead of trying to pick winners. Cheap, and hard to beat.",
    body: [
      "An S&P 500 index fund owns all 500 companies in proportion to their size. A total market fund owns essentially every public US company.",
      "No manager is choosing stocks, so the fee is tiny — often 0.03% versus 1% or more for an actively managed fund.",
      "Over 15-year periods, the large majority of active funds underperform their benchmark after fees. And the ones that win in one period are mostly not the ones that win in the next.",
      "Three funds cover a complete portfolio: total US stock, total international stock, total bond. Or one target-date fund that holds all three and adjusts as you age.",
      "This is what nearly every economist, and the trustee of Warren Buffett's own estate instructions, recommends for ordinary investors.",
    ],
    example:
      "$100,000 over 30 years at 7%: about $761,000 in a 0.03% index fund, versus about $574,000 in a 1% active fund. The $187,000 difference is fees.",
    related: ["expense_ratio", "asset_allocation", "dollar_cost_averaging"],
  },
  {
    key: "expense_ratio",
    term: "Expense ratio",
    short: "The annual percentage a fund charges you, taken automatically whether it gains or loses.",
    body: [
      "A 1% expense ratio on $100,000 is $1,000 a year, deducted invisibly from the fund's value. You never see a bill.",
      "It sounds trivial and isn't. Over 30 years, a 1% fee typically consumes roughly a quarter of the final balance.",
      "Under 0.20% is fine. Under 0.10% is better. Above 0.50% needs a specific justification.",
      "It's also the most reliable predictor of future fund performance that exists — lower-cost funds beat higher-cost ones on average, consistently.",
    ],
    related: ["index_funds"],
  },
  {
    key: "asset_allocation",
    term: "Asset allocation",
    short: "How your money splits between stocks (growth, volatile) and bonds (stable, slower).",
    body: [
      "Stocks return more over long periods and fall much harder in the short term — 30-50% drops happen, and have always recovered given enough time.",
      "Bonds return less and are far steadier. Their job is to make the portfolio survivable when you need the money sooner.",
      "A common rule of thumb: hold roughly (110 − your age)% in stocks. At 40, that's 70% stocks / 30% bonds.",
      "The right split mostly depends on when you need the money and whether you'd panic-sell in a crash. Both matter; the second one more than people admit.",
    ],
    related: ["index_funds", "rebalancing"],
  },
  {
    key: "rebalancing",
    term: "Rebalancing",
    short: "Periodically resetting your mix back to target by selling what grew and buying what lagged.",
    body: [
      "If stocks surge, a 70/30 portfolio drifts to 80/20 — more risk than you chose, arrived at by accident.",
      "Rebalancing sells some stocks and buys bonds to get back to 70/30. It enforces buying low and selling high mechanically, without judgment.",
      "Once a year is plenty. In retirement accounts it triggers no tax.",
      "A target-date fund does this automatically, which is a large part of its value.",
    ],
    related: ["asset_allocation"],
  },
  {
    key: "dollar_cost_averaging",
    term: "Dollar-cost averaging",
    short: "Investing a fixed amount on a schedule instead of trying to pick the right moment.",
    body: [
      "Every 401(k) contribution already does this — same amount, every paycheck, regardless of price.",
      "You buy more shares when prices are low and fewer when high, automatically.",
      "The main benefit is behavioral: it removes the decision, and the decision is where people lose money by waiting for a better entry point that never announces itself.",
    ],
    related: ["index_funds"],
  },
  {
    key: "compound_growth",
    term: "Compound growth",
    short: "Growth on your growth. It starts slow and then stops being slow.",
    body: [
      "$10,000 at 7% is $10,700 after a year. The next year earns 7% on $10,700, not $10,000.",
      "Over 40 years that $10,000 becomes about $150,000, with no further contributions.",
      "This is why starting early beats contributing more later. $200/month from age 25 to 65 beats $400/month from age 40 to 65, despite putting in less total money.",
      "It's also why high-interest debt is so destructive — the same mechanism, running against you.",
    ],
    example:
      "$200/month for 40 years at 7% = about $525,000, of which $96,000 was your money and the rest is growth.",
    related: ["index_funds", "savings_rate"],
  },
  {
    key: "good_vs_bad_debt",
    term: "Good debt vs bad debt",
    short: "Debt below ~7% can be paid on schedule. Above it, pay it off before investing.",
    body: [
      "The comparison is simple: paying off a debt is a guaranteed return equal to its interest rate. Investing is an expected return of about 7%, with no guarantee.",
      "Credit card debt at 22% is a guaranteed 22% loss every year. Nothing in a brokerage account competes with clearing that.",
      "A 3% mortgage is the opposite: pay it on schedule and invest the difference.",
      "The one thing that outranks even credit card payoff is capturing an employer 401(k) match.",
    ],
    related: ["avalanche_vs_snowball"],
  },
  {
    key: "avalanche_vs_snowball",
    term: "Avalanche vs snowball",
    short: "Two ways to order debt payoff: highest rate first (cheaper) or smallest balance first (more motivating).",
    body: [
      "Avalanche: pay minimums everywhere, throw everything extra at the highest interest rate. Mathematically optimal — costs the least.",
      "Snowball: attack the smallest balance first. Costs slightly more, but clearing a whole debt early is genuinely motivating and people stick with it.",
      "The best method is the one you actually finish. If the math method has stalled twice, switch.",
    ],
    related: ["good_vs_bad_debt"],
  },
  {
    key: "term_life",
    term: "Term life insurance",
    short: "Pure insurance for a fixed number of years. Cheap, simple, and what most families need.",
    body: [
      "You pay a level premium for 10, 20, or 30 years. If you die during the term, your family receives the payout tax-free. If you don't, it expires and pays nothing — which is the correct outcome.",
      "It's cheap precisely because it's not an investment. A healthy 35-year-old can often get $1,000,000 of 20-year coverage for $30-60 a month.",
      "Size it with DIME: Debt + Income replacement + Mortgage + Education, minus what you've already saved.",
      "Match the term to how long someone depends on you — usually until the youngest child finishes college and the mortgage is paid.",
      "Buy it while you're healthy. Pricing locks at underwriting, and a diagnosis can make you uninsurable at any price.",
    ],
    related: ["whole_life", "dime_method"],
  },
  {
    key: "whole_life",
    term: "Whole life insurance",
    short: "Permanent insurance with a savings component. Roughly 10x the cost, and a poor fit for most families.",
    body: [
      "Whole life combines a death benefit that never expires with a 'cash value' account that grows slowly.",
      "It typically costs about ten times what equivalent term coverage costs. $500,000 might be $50/month as term and $500/month as whole life.",
      "The sales pitch is 'guaranteed returns, tax-free growth, and you get money back'. What's usually not said: the internal return is often negative for the first decade, fees are opaque, surrendering early loses most of what you paid, and the selling agent's commission is frequently close to your entire first-year premium.",
      "Buy term and invest the difference. The $450/month difference above, invested at 7% for 30 years, is about $510,000 — far more than the policy's cash value would be.",
      "Whole life does genuinely fit a few situations: an estate above the federal exemption needing liquidity to pay tax, a permanently dependent child needing lifelong support, or funding a business buy-sell agreement. If one of those applies, talk to a FEE-ONLY advisor — one paid by you, not by the insurer.",
      "If you already own a policy that's several years old, don't cancel reflexively. The worst costs are already sunk. Get an in-force illustration and look at 1035 exchange or reduced-paid-up options first.",
    ],
    related: ["term_life", "dime_method"],
  },
  {
    key: "dime_method",
    term: "DIME method",
    short: "A way to size life insurance: Debt + Income + Mortgage + Education.",
    body: [
      "Debt: everything owed besides the mortgage.",
      "Income: annual income × the number of years your family would need it replaced.",
      "Mortgage: the remaining balance, so the family can stay in the house.",
      "Education: rough cost of putting the children through college.",
      "Add them, subtract what you've already saved and invested. That's the coverage gap.",
    ],
    related: ["term_life"],
  },
  {
    key: "disability_insurance",
    term: "Disability insurance",
    short: "Replaces part of your income if illness or injury stops you working. More likely to be needed than life insurance.",
    body: [
      "About one in four of today's 20-year-olds will have a disability lasting a year or more before retirement — more likely than dying in the same window.",
      "Aim for a benefit around 60% of income. If you pay the premium with after-tax dollars, the benefit arrives tax-free, so 60% of gross replaces close to your take-home.",
      "'Own occupation' pays if you can't do YOUR job. 'Any occupation' pays only if you can't do any work at all. The difference is large and it's where cheap policies cut cost.",
      "Employer coverage is a good start but usually caps out, is taxable if the employer pays, and disappears when you change jobs.",
    ],
    related: ["term_life"],
  },
  {
    key: "umbrella_insurance",
    term: "Umbrella insurance",
    short: "Extra liability coverage above your auto and home policies. Very cheap per dollar of protection.",
    body: [
      "If you're at fault in a serious accident and the judgment exceeds your auto policy limit, the rest comes from your savings, investments, and future wages.",
      "Umbrella coverage sits on top and typically costs $150-$400 a year per million.",
      "Once you have assets worth suing for — roughly $500,000 of net worth — this becomes obvious value.",
    ],
    related: [],
  },
  {
    key: "529_plan",
    term: "529 plan",
    short: "An investment account for education. Grows tax-free, comes out tax-free for school costs.",
    body: [
      "Contributions are after-tax, but growth and qualified withdrawals are entirely untaxed.",
      "About 30 states also give a state income tax deduction or credit for contributions. Some, like California, give nothing — in which case use whichever state's plan is cheapest.",
      "Covers tuition, fees, books, room and board, and up to $10,000/year of K-12 tuition.",
      "Leftover money isn't stranded: change the beneficiary to a sibling or yourself, or move up to $35,000 lifetime into the beneficiary's Roth IRA once the account is 15 years old.",
      "Use the age-based portfolio. It shifts from stocks to bonds automatically as college approaches — the step people otherwise forget.",
      "Parent-owned 529 assets count toward financial aid at up to 5.64%, far better than money held in the student's own name.",
    ],
    related: ["college_costs", "financial_aid", "compound_growth"],
  },
  {
    key: "college_costs",
    term: "College costs",
    short: "Around $28,000/year for in-state public and rising about 5% a year — faster than inflation.",
    body: [
      "In-state public runs roughly $28,000 a year all-in. Out-of-state public around $46,000. Private around $62,000.",
      "It has risen faster than general inflation for decades. A newborn today may face $70,000+ per year for in-state public.",
      "Which is why the sane target is HALF of in-state public cost. Full private for multiple children is how families wreck their retirement.",
      "The remainder comes from income during the college years, the student working, scholarships, and community college for the first two years — which is a legitimately good financial decision, not a consolation prize.",
    ],
    related: ["529_plan", "financial_aid"],
  },
  {
    key: "financial_aid",
    term: "Financial aid",
    short: "Need-based aid depends on income far more than on savings. Saving rarely disqualifies you.",
    body: [
      "The formula weighs parent income heavily and parent assets lightly — parent-owned 529 assets count at up to 5.64%, while student-owned assets count at 20%.",
      "Retirement accounts are not counted as assets at all.",
      "Fill out the FAFSA regardless of income. It gates federal loans and many merit scholarships, not just need-based grants.",
      "'I shouldn't save because it hurts aid' is one of the most expensive myths in this area. Saving $50,000 reduces aid by a few thousand at most.",
    ],
    related: ["529_plan", "college_costs"],
  },
  {
    key: "savings_rate",
    term: "Savings rate",
    short: "The share of income you don't spend. It matters more than investment returns.",
    body: [
      "Income minus spending, divided by income. Saving $2,000 of $8,000 a month is 25%.",
      "20% is a strong target. 10% is a floor. Above 30% and early retirement becomes arithmetic rather than fantasy.",
      "Over a working life, the gap between saving 10% and 20% dwarfs the gap between a 6% and 7% return — and unlike returns, it's under your control.",
      "The largest levers are the three biggest expenses: housing, transportation, food. Cancelling a streaming service is satisfying; moving the housing number is decisive.",
    ],
    related: ["lifestyle_creep", "compound_growth"],
  },
  {
    key: "lifestyle_creep",
    term: "Lifestyle creep",
    short: "Spending rising to match every raise, so a higher income never feels like more money.",
    body: [
      "A raise arrives, the car gets nicer, the apartment gets bigger, and the savings rate is exactly where it was.",
      "The fix is mechanical: when income rises, raise the automatic contribution first, and live on the rest.",
      "Saving half of every raise still means every raise feels like a raise, while the savings rate climbs steadily.",
    ],
    related: ["savings_rate"],
  },
  {
    key: "taxable_brokerage",
    term: "Taxable brokerage account",
    short: "A normal investment account. No limits, no penalties, no withdrawal age.",
    body: [
      "No contribution cap and no rules about when you can take money out.",
      "You pay tax on dividends each year and on gains when you sell. Held over a year, gains are taxed at 0%, 15%, or 20% — lower than income tax rates.",
      "This is the account that funds anything before 59½: a sabbatical, early retirement, a house.",
      "Index funds make it quite tax-efficient on their own, since low turnover means few taxable distributions.",
    ],
    related: ["capital_gains", "tax_loss_harvesting", "index_funds"],
  },
  {
    key: "capital_gains",
    term: "Capital gains",
    short: "Profit from selling an investment. Held over a year, it's taxed at a lower rate than income.",
    body: [
      "Short-term (held a year or less) is taxed as ordinary income — up to 37%.",
      "Long-term (held more than a year) is taxed at 0%, 15%, or 20% depending on income.",
      "Waiting past the one-year mark to sell is often the single highest-value piece of tax planning available to an ordinary investor.",
      "Gains are only taxed when you sell. Holding defers the tax indefinitely.",
    ],
    related: ["taxable_brokerage", "tax_loss_harvesting"],
  },
  {
    key: "tax_loss_harvesting",
    term: "Tax-loss harvesting",
    short: "Selling a losing investment to offset gains, while staying invested.",
    body: [
      "Sell a position that's down, use the loss to offset capital gains, and deduct up to $3,000 a year against ordinary income. Unused losses carry forward.",
      "Immediately buy something similar but not identical, so you stay in the market.",
      "The wash sale rule disallows the loss if you buy the SAME or a 'substantially identical' security within 30 days — including in your IRA, and including automatic dividend reinvestment.",
      "Only applies in taxable accounts. There's nothing to harvest inside an IRA or 401(k).",
    ],
    related: ["capital_gains", "taxable_brokerage"],
  },
  {
    key: "spousal_ira",
    term: "Spousal IRA",
    short: "A married couple can fund an IRA for a spouse with little or no income.",
    body: [
      "Normally an IRA contribution requires earned income. This is the exception, for married couples filing jointly.",
      "As long as household earned income covers both contributions, the non-working spouse gets their own $7,500 (2026) account.",
      "It's in that spouse's name, individually. That matters for retirement and, plainly, for financial independence within a marriage.",
      "This is the most commonly missed account in single-income households.",
    ],
    related: ["roth_ira", "backdoor_roth"],
  },
  {
    key: "solo_401k",
    term: "Solo 401(k)",
    short: "A 401(k) for the self-employed with no employees. Much larger limits than an IRA.",
    body: [
      "You're both employee and employer, so you make both contributions: up to $24,500 as the employee, plus roughly 20% of net self-employment income as the employer, up to $72,000 total.",
      "Better than a SEP-IRA in two ways: more room at moderate incomes, and the balance doesn't interfere with the Backdoor Roth pro-rata rule.",
      "Must be established by your business's tax year end for employee deferrals — don't leave it to April.",
      "Free to open at the major brokerages, with no ongoing fee.",
    ],
    related: ["401k_basics", "self_employment_retirement", "pro_rata_rule"],
  },
  {
    key: "self_employment_retirement",
    term: "Self-employed retirement options",
    short: "Solo 401(k), SEP-IRA, and SIMPLE IRA — with different limits and tradeoffs.",
    body: [
      "Solo 401(k): highest limits, allows Roth contributions, keeps the Backdoor Roth clean. Best for most solo operators.",
      "SEP-IRA: simplest to open, employer contributions only (~20% of net), but the balance triggers the pro-rata rule on Roth conversions.",
      "SIMPLE IRA: for small businesses with employees. Lower limits ($17,000 in 2026), mandatory employer contributions.",
      "Contributions are discretionary year to year, which suits variable income.",
    ],
    related: ["solo_401k", "pro_rata_rule"],
  },
  {
    key: "four_percent_rule",
    term: "The 4% rule",
    short: "A rough guide: you can withdraw about 4% of a portfolio each year in retirement.",
    body: [
      "Comes from research on historical US market returns: a 4% initial withdrawal, adjusted for inflation, survived every 30-year window tested.",
      "The practical version: multiply the annual income you want by 25. Want $80,000 a year? You need roughly $2,000,000.",
      "It's a planning heuristic, not a guarantee. Real retirees adjust spending in bad years, which is exactly what makes it work in practice.",
      "It excludes Social Security, which covers a meaningful share for most households and lowers the number you actually need.",
    ],
    related: ["compound_growth", "asset_allocation"],
  },
  {
    key: "will_vs_beneficiary",
    term: "Will vs beneficiary designation",
    short: "Beneficiary designations override your will. Both need to be current.",
    body: [
      "Retirement accounts and life insurance pass by BENEFICIARY DESIGNATION, outside the will entirely.",
      "An ex-spouse still listed on a 401(k) from three jobs ago inherits it, whatever the will says. This happens constantly.",
      "A will covers everything else — and it's the only place you name a guardian for your children.",
      "Update both after any birth, death, marriage, or divorce. Name contingent beneficiaries too.",
    ],
    related: ["estate_basics"],
  },
  {
    key: "estate_basics",
    term: "Estate planning basics",
    short: "A will, current beneficiaries, a healthcare directive, and a power of attorney.",
    body: [
      "Will: names a guardian for minor children and directs everything not covered by a beneficiary designation.",
      "Beneficiary designations: on every retirement account and insurance policy. Free, and take about 20 minutes.",
      "Healthcare directive: who decides medical care if you can't, and what you'd want. This one matters while you're alive.",
      "Financial power of attorney: who can handle money matters if you're incapacitated.",
      "A revocable living trust avoids probate and is worth considering with significant assets or property in multiple states.",
      "Online services handle straightforward situations well. Blended families, a business, or property in several states need an attorney.",
    ],
    related: ["will_vs_beneficiary"],
  },
];

export const LEARN_BY_KEY: Record<string, LearnTopic> = Object.fromEntries(
  LEARN_TOPICS.map((t) => [t.key, t])
);

export function learnTopic(key: string): LearnTopic | undefined {
  return LEARN_BY_KEY[key];
}

/** Learning paths — an order to read them in, for someone starting from zero. */
export const LEARN_PATHS: { key: string; name: string; blurb: string; topics: string[] }[] = [
  {
    key: "start_here",
    name: "Start here",
    blurb: "If you've never been taught any of this, read these five in order.",
    topics: ["emergency_fund", "good_vs_bad_debt", "employer_match", "401k_basics", "index_funds"],
  },
  {
    key: "retirement",
    name: "Retirement accounts",
    blurb: "The accounts, in the order you should fill them.",
    topics: [
      "employer_match",
      "hsa",
      "401k_basics",
      "roth_vs_traditional",
      "roth_ira",
      "backdoor_roth",
      "mega_backdoor_roth",
      "spousal_ira",
    ],
  },
  {
    key: "investing",
    name: "Investing",
    blurb: "What to actually buy, and what it costs when you buy the expensive version.",
    topics: [
      "index_funds",
      "expense_ratio",
      "asset_allocation",
      "rebalancing",
      "dollar_cost_averaging",
      "compound_growth",
    ],
  },
  {
    key: "protection",
    name: "Protecting the family",
    blurb: "Insurance and estate basics — including which products to be skeptical of.",
    topics: [
      "term_life",
      "whole_life",
      "dime_method",
      "disability_insurance",
      "umbrella_insurance",
      "will_vs_beneficiary",
      "estate_basics",
    ],
  },
  {
    key: "kids",
    name: "Saving for kids",
    blurb: "College costs, 529s, and how financial aid actually works.",
    topics: ["529_plan", "college_costs", "financial_aid"],
  },
  {
    key: "taxes",
    name: "Taxes & advanced",
    blurb: "The details that save real money once the basics are in place.",
    topics: [
      "taxable_brokerage",
      "capital_gains",
      "tax_loss_harvesting",
      "pro_rata_rule",
      "form_8606",
      "415c_limit",
      "fica",
    ],
  },
];
