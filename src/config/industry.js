// Industry evidence for valuation-model routing, keyed by symbol. Missing provider
// columns (operating income, free cash flow) are a data gap, not a business model;
// they never decide the route on their own. Each row cites the filing that states
// the business. Add a row only with a citable source.
export const INDUSTRY_EVIDENCE = Object.freeze({
  // Net-lease REIT (SEC SIC 6798): the provider files no operating-income or
  // FCF-per-share column, which used to route it to the bank model.
  'NYSE:O': Object.freeze({
    industry: 'reit',
    financial: false,
    source: 'https://www.sec.gov/Archives/edgar/data/726728/000072672826000011/o-20251231.htm',
  }),
  // Healthcare REIT (SEC SIC 6798), same missing columns as O.
  'NYSE:WELL': Object.freeze({
    industry: 'reit',
    financial: false,
    source: 'https://www.sec.gov/Archives/edgar/data/766704/000076670426000010/well-20251231.htm',
  }),
  // Downstream refiner (SEC SIC 2911), not a bank: no operating-income column either.
  'NYSE:PSX': Object.freeze({
    industry: 'refining',
    financial: false,
    source: 'https://www.sec.gov/Archives/edgar/data/1534701/000153470126000006/psx-20251231.htm',
  }),
  // Loews files under SIC 6331 because of CNA, but its FY2025 10-K describes a
  // holding company that also owns Boardwalk Pipelines and Loews Hotels, so it
  // stays on the owner model and is not routed by SIC or the quote name alone.
  'NYSE:L': Object.freeze({
    industry: 'holding-company',
    financial: false,
    source: 'https://www.sec.gov/Archives/edgar/data/60086/000006008626000008/l-20251231.htm',
  }),
  // US filers that used to be routed by the missing-column shape alone. The
  // SIC code and 10-K cover page state the business; all are financial.
  'NASDAQ:PFG': Object.freeze({ industry: 'insurance', financial: true, source: 'https://www.sec.gov/Archives/edgar/data/1126328/000110465926017031/pfg-20251231x10k.htm' }), // SIC 6321
  'NYSE:APO': Object.freeze({ industry: 'asset-manager', financial: true, source: 'https://www.sec.gov/Archives/edgar/data/1858681/000185868126000013/apo-20251231.htm' }), // SIC 6282
  'NYSE:CB': Object.freeze({ industry: 'insurance', financial: true, source: 'https://www.sec.gov/Archives/edgar/data/896159/000089615926000005/cb-20251231.htm' }), // SIC 6331
  'NYSE:EG': Object.freeze({ industry: 'insurance', financial: true, source: 'https://www.sec.gov/Archives/edgar/data/1095073/000109507326000006/eg-20251231.htm' }), // SIC 6331
  'NYSE:GS': Object.freeze({ industry: 'broker', financial: true, source: 'https://www.sec.gov/Archives/edgar/data/886982/000088698226000091/gs-20251231.htm' }), // SIC 6211
  'NYSE:JPM': Object.freeze({ industry: 'bank', financial: true, source: 'https://www.sec.gov/Archives/edgar/data/19617/000162828026008131/jpm-20251231.htm' }), // SIC 6021
  'NYSE:MS': Object.freeze({ industry: 'broker', financial: true, source: 'https://www.sec.gov/Archives/edgar/data/895421/000089542126000086/ms-20251231.htm' }), // SIC 6211
  'NYSE:PNC': Object.freeze({ industry: 'bank', financial: true, source: 'https://www.sec.gov/Archives/edgar/data/713676/000071367626000020/pnc-20251231.htm' }), // SIC 6021
  'NYSE:PRU': Object.freeze({ industry: 'insurance', financial: true, life: true, source: 'https://www.sec.gov/Archives/edgar/data/1137774/000113777426000048/pru-20251231.htm' }), // SIC 6311 Life Insurance
  // Underwriting insurers that previously lacked an evidence row. Brokers
  // (MRSH / AON / WTW, SIC 6411) are not added.
  'NYSE:PGR': Object.freeze({ industry: 'insurance', financial: true, source: 'https://www.sec.gov/Archives/edgar/data/80661/000008066126000086/pgr-20251231.htm' }), // SIC 6331
  'NYSE:TRV': Object.freeze({ industry: 'insurance', financial: true, source: 'https://www.sec.gov/Archives/edgar/data/86312/000008631226000065/trv-20251231.htm' }), // SIC 6331
  'NYSE:MET': Object.freeze({ industry: 'insurance', financial: true, life: true, source: 'https://www.sec.gov/Archives/edgar/data/1099219/000109921926000013/met-20251231.htm' }), // SIC 6311 Life Insurance
  'NYSE:AFL': Object.freeze({ industry: 'insurance', financial: true, life: true, source: 'https://www.sec.gov/Archives/edgar/data/4977/000162828026011402/afl-20251231.htm' }), // SIC 6321 Accident & Health
  'NYSE:HIG': Object.freeze({ industry: 'insurance', financial: true, source: 'https://www.sec.gov/Archives/edgar/data/874766/000087476626000012/hig-20251231.htm' }), // SIC 6331
  'NYSE:AIG': Object.freeze({ industry: 'insurance', financial: true, source: 'https://www.sec.gov/Archives/edgar/data/5272/000000527226000023/aig-20251231.htm' }), // SIC 6331
  'NYSE:ALL': Object.freeze({ industry: 'insurance', financial: true, source: 'https://www.sec.gov/Archives/edgar/data/899051/000089905126000031/all-20251231.htm' }), // SIC 6331
  'NASDAQ:CINF': Object.freeze({ industry: 'insurance', financial: true, source: 'https://www.sec.gov/Archives/edgar/data/20286/000002028626000008/cinf-20251231.htm' }), // SIC 6331
  'NASDAQ:ACGL': Object.freeze({ industry: 'insurance', financial: true, source: 'https://www.sec.gov/Archives/edgar/data/947484/000094748426000017/acgl-20251231.htm' }), // SIC 6331
  'NYSE:SYF': Object.freeze({ industry: 'consumer-finance', financial: true, source: 'https://www.sec.gov/Archives/edgar/data/1601712/000160171226000006/syf-20251231.htm' }), // SIC 6199
  'NYSE:TFC': Object.freeze({ industry: 'bank', financial: true, source: 'https://www.sec.gov/Archives/edgar/data/92230/000009223026000030/tfc-20251231.htm' }), // SIC 6021
  'NYSE:USB': Object.freeze({ industry: 'bank', financial: true, source: 'https://www.sec.gov/Archives/edgar/data/36104/000003610426000011/usb-20251231.htm' }), // SIC 6021
  'NYSE:WFC': Object.freeze({ industry: 'bank', financial: true, source: 'https://www.sec.gov/Archives/edgar/data/72971/000007297126000133/wfc-20251231_d2.htm' }), // SIC 6021
})

export const industryEvidence = (symbol) => INDUSTRY_EVIDENCE[symbol] || null
