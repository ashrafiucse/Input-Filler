// Hand-curated wordlists. All entries are original compositions (license-clean).

export const FIRST_NAMES = [
  'Eleanor', 'Marcus', 'Priya', 'Olivia', 'Daniel', 'Sofia', 'Liam', 'Ava', 'Noah',
  'Mia', 'Ethan', 'Isla', 'Lucas', 'Zoe', 'Henry', 'Nora', 'Leo', 'Ruby', 'Theo',
  'Hazel', 'Felix', 'Ivy', 'Owen', 'Cora', 'Asher', 'Maya', 'Jude', 'Lila', 'Silas',
  'Ada',
] as const;

export const LAST_NAMES = [
  'Whitfield', 'Patel', 'Garcia', 'Nguyen', 'Bennett', 'Okafor', 'Rossi', 'Kim',
  'Martinez', 'Larsson', 'Cohen', 'Walker', 'Diaz', 'Novak', 'Foster', 'Khan',
  'Bauer', 'Reyes', 'Petrov', 'Mori', 'Holt', 'Silva', 'Varga', 'Adeyemi', 'Costa',
  'Brennan', 'Hassan', 'Lindqvist', 'Mercer', 'Vargas',
] as const;

export const CITIES = [
  'Madison', 'Austin', 'Portland', 'Denver', 'Seattle', 'Boston', 'Atlanta',
  'Phoenix', 'Chicago', 'Nashville', 'Pittsburgh', 'Boulder', 'Savannah', 'Tacoma',
  'Raleigh', 'Eugene', 'Buffalo', 'Toledo', 'Helena', 'Ithaca', 'Fargo', 'Omaha',
  'Boise', 'Tulsa', 'Anchorage',
] as const;

// US state codes (a realistic subset for readable addresses).
export const STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN',
  'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV',
  'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN',
  'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
] as const;

export const STREET_NAMES = [
  'Maplewood', 'Oakridge', 'Birchhill', 'Cedarbrook', 'Pinecrest', 'Elmwood',
  'Willowby', 'Aspen', 'Lakeside', 'Riverbend', 'Hillcrest', 'Forest', 'Highland',
  'Meadowbrook', 'Sunset', 'Linden', 'Hawthorne', 'Juniper', 'Magnolia', 'Sterling',
] as const;

export const STREET_SUFFIXES = ['St', 'Ave', 'Blvd', 'Lane', 'Dr', 'Ct', 'Way', 'Pl'] as const;

export const COMPANY_PREFIXES = [
  'Northwind', 'Bluepeak', 'Riverbend', 'Solstice', 'Ironwood', 'Crestline',
  'Foxglove', 'Meridian', 'Stonebridge', 'Larkspur', 'Bright Harbor', 'Cinder',
  'Halcyon', 'Verdant', 'Cobalt',
] as const;

export const COMPANY_SUFFIXES = [
  'Analytics', 'Labs', 'Systems', 'Industries', 'Group', 'Partners', 'Ventures',
  'Software', 'Dynamics', 'Works',
] as const;

export const JOB_TITLES = [
  'Product Operations Lead', 'Software Engineer', 'Customer Success Manager',
  'Data Analyst', 'Marketing Coordinator', 'UX Researcher', 'DevOps Engineer',
  'Sales Associate', 'Project Manager', 'Financial Analyst', 'Technical Writer',
  'HR Generalist', 'Solutions Architect', 'Account Executive', 'QA Engineer',
  'Operations Specialist', 'Brand Strategist', 'Engineering Manager',
  'Recruiter', 'Support Engineer',
] as const;

// RFC 2606 / 2607 reserved example domains — safe for generated test data.
export const DOMAINS = ['example.com', 'testmail.com', 'inbox.example.net', 'mail.example.org'] as const;

export const COUNTRIES = [
  'United States', 'Canada', 'United Kingdom', 'Australia', 'Germany', 'France',
  'Spain', 'India', 'Brazil', 'Japan',
] as const;

// Content-title composition (course / chapter / lesson / quiz / assignment /
// session / curriculum / project). Composed at fill time so titles stay fresh.
export const TITLE_TOPICS = [
  'Web Development', 'Data Structures', 'Public Speaking', 'Digital Marketing',
  'Graphic Design', 'Machine Learning', 'Project Management', 'UI/UX Design',
  'Photography', 'Statistics', 'Cloud Computing', 'Business Strategy',
  'Creative Writing', 'Financial Literacy', 'Conversational Spanish',
  'Critical Thinking', 'Time Management', 'Cybersecurity Basics',
] as const;

export const TITLE_TOOLS = [
  'React', 'Laravel', 'Python', 'Figma', 'Excel', 'Node.js', 'Tailwind CSS',
  'Docker', 'SQL', 'Notion',
] as const;

export const TITLE_PREFIXES = [
  'Introduction to', 'Mastering', 'Foundations of', 'Advanced',
  'Getting Started with', 'Essentials of', 'Practical', 'The Complete Guide to',
] as const;

// Realistic single-token search terms for search/filter inputs.
export const SEARCH_TOKENS = [
  'completed', 'pending', 'refund', 'invoice', 'active', 'trial', 'canceled',
  'enrolled', 'overdue', 'draft', 'renewal', 'upgrade',
] as const;

// Generic tax / sales-tax names.
export const TAX_NAMES = ['VAT', 'GST', 'Sales Tax', 'HST', 'PST', 'Consumption Tax'] as const;

// Action-oriented learning objectives (for "Objective {n}" / outcome fields).
export const OBJECTIVES = [
  'Build a responsive layout from a provided design file.',
  'Explain the request and response lifecycle of a web application.',
  'Write unit tests that guard against regressions.',
  'Refactor a function to improve readability without changing behavior.',
  'Diagram a relational schema for a small e-commerce domain.',
  'Deploy a service to a cloud host using a continuous integration pipeline.',
  'Interpret a dataset using summary statistics and clear visuals.',
  'Break a large feature into small, independently shippable tasks.',
  'Apply accessibility practices to reach a broader range of users.',
  'Debug a failing test by isolating the smallest reproducible case.',
  'Estimate work using realistic assumptions and stated risks.',
  'Communicate a technical decision to a non-technical stakeholder.',
] as const;
