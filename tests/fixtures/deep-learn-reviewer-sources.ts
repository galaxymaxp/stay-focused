export type ReviewerSourceFixture = {
  id: string
  title: string
  sourceType: 'canvas_page' | 'pdf_text' | 'ocr_text'
  extractedText: string
  expectedMajorSections: string[]
  notes: string
}

export const reviewerSourceFixtures: ReviewerSourceFixture[] = [
  {
    id: 'multi-phase-systems-analysis',
    title: 'Generic Multi-Phase Systems Analysis Source',
    sourceType: 'canvas_page',
    expectedMajorSections: [
      'PHASE 1: Identifying Problems, Opportunities and Objectives',
      'PHASE 2: Determining Information Requirements',
      'PHASE 3: Analyzing System Needs',
      'PHASE 4: Designing the Recommended System',
      'PHASE 5: Developing and Documenting Software',
      'PHASE 6: Testing and Maintaining the System',
      'PHASE 7: Implementing and Evaluating the System',
    ],
    notes:
      'This fixture represents the SDLC-style failure: many major phases, early sections over-selected, later phases dropped or compressed into one heading-list card.',
    extractedText: `
SYSTEMS ANALYSIS AND DESIGN
THE SEVEN PHASES OF SYSTEM DEVELOPMENT

Systems analysis and design is a disciplined approach used to understand business problems, identify opportunities, determine information requirements, and recommend improved systems. A systems analyst studies the existing environment, talks with users, reviews documents, identifies problems, and develops recommendations that can improve organizational processes.

The system development process can be organized into seven major phases. These phases are not always perfectly linear, but each phase has a distinct purpose. A complete review output should explain all phases, not only the first phase.

PHASE 1: Identifying Problems, Opportunities and Objectives

The first phase of systems analysis begins when the analyst identifies problems, opportunities, and objectives. Problems are situations that prevent the organization from achieving its goals. Opportunities are chances to improve performance, reduce cost, increase service quality, or create a competitive advantage. Objectives describe what the organization wants to accomplish.

In this phase, the analyst must understand the context of the organization and the reason for considering a new or improved system. The analyst may interview managers, observe work procedures, study existing reports, and review complaints or performance issues.

A Feasibility Study

A feasibility study is an investigation that ascertains the viability of an undertaking. It helps determine whether a proposed system is practical, beneficial, and achievable.

The feasibility study commonly includes these steps:

A. Define the problem or opportunity clearly.
B. Identify the users and stakeholders affected by the system.
C. Develop a high-level model of the existing process.
D. Determine if there is a feasible solution.
E. Estimate the resources required.
F. Evaluate technical, economic, operational, and schedule feasibility.
G. Compare possible alternatives.
H. Recommend whether the project should continue.
I. Present the findings to decision makers.

Technical feasibility asks whether the organization has the technology, skills, hardware, software, and technical capacity to build or acquire the proposed system. Economic feasibility asks whether the expected benefits justify the cost. Operational feasibility asks whether the system will actually work in the organization and be accepted by users. Schedule feasibility asks whether the project can be completed within the required time.

PHASE 2: Determining Information Requirements

The second phase focuses on discovering what information users need to perform their work. The analyst studies business processes, user roles, forms, reports, data flows, and decision points. This phase requires direct communication with users because requirements cannot be guessed.

Information requirements describe what data must be captured, how it should be processed, what outputs are needed, and what decisions the system should support. Analysts may use interviews, questionnaires, observation, sampling, document review, and workshops to collect requirements.

A complete requirements phase identifies inputs, outputs, processing rules, data storage needs, security requirements, performance expectations, and user constraints. Poor requirements gathering can lead to systems that are technically functional but fail to solve the real problem.

PHASE 3: Analyzing System Needs

The third phase is concerned with analyzing the needs of the system based on the gathered requirements. The analyst studies how the current system works and identifies gaps, inefficiencies, duplication, missing controls, or delays.

Tools used in analysis may include data flow diagrams, process models, use cases, entity relationship diagrams, decision tables, and decision trees. These tools help organize complex information and reveal relationships between users, data, processes, and outputs.

The analyst evaluates alternative solutions and determines what the recommended system must do. This phase transforms raw requirements into a logical model of the proposed system. It also helps distinguish essential requirements from optional features.

PHASE 4: Designing the Recommended System

The fourth phase involves designing the system that will be recommended to the organization. Design translates analysis into a practical plan for construction or configuration.

Design activities include designing input forms, output reports, user interfaces, databases, files, controls, security measures, and procedures. The analyst must consider usability, accuracy, reliability, maintainability, and security.

A good system design should match user requirements and organizational goals. It should also define how data will be validated, stored, retrieved, protected, and presented. The design becomes the guide for developers and implementers.

PHASE 5: Developing and Documenting Software

The fifth phase focuses on creating or configuring the software and preparing documentation. Developers write code, configure platforms, build databases, create interfaces, and connect system components.

Documentation is also a major part of this phase. Program documentation explains how the software works internally. User documentation explains how users should operate the system. Operations documentation explains procedures for running, backing up, monitoring, and maintaining the system.

Clear documentation is important because systems must be maintained after implementation. Without documentation, future changes become difficult, expensive, and risky.

PHASE 6: Testing and Maintaining the System

The sixth phase ensures that the system works correctly before and after implementation. Testing checks whether the system satisfies requirements, processes data correctly, handles errors, and performs reliably.

Testing may include unit testing, integration testing, system testing, acceptance testing, security testing, and performance testing. Users should participate in acceptance testing because they can confirm whether the system supports real work.

Maintenance begins after the system is operational. Maintenance includes correcting errors, improving performance, adapting to new requirements, updating security controls, and supporting users. A system is not finished after deployment because organizational needs continue to change.

PHASE 7: Implementing and Evaluating the System

The seventh phase involves putting the system into actual use and evaluating whether it meets its objectives. Implementation may use direct conversion, parallel conversion, phased conversion, or pilot conversion.

Direct conversion replaces the old system immediately. Parallel conversion runs the old and new systems together for a period of time. Phased conversion introduces the system in stages. Pilot conversion introduces the system first in one department or location.

Training is an important part of implementation. Users must understand how to use the new system and how their work processes may change. Evaluation determines whether the system solved the original problem, met the objectives, and delivered expected benefits.

Evaluation may include user feedback, performance measures, error rates, cost comparisons, productivity changes, and service quality improvements. If the system does not meet objectives, analysts may recommend corrections or further development.

SUMMARY

The seven phases of system development are connected. Identifying problems gives direction. Determining information requirements reveals what users need. Analyzing system needs creates a logical understanding. Designing the recommended system creates the blueprint. Developing and documenting software builds the solution. Testing and maintaining the system protects quality. Implementing and evaluating the system confirms whether the solution works in practice.

A reviewer must cover each phase directly. It is not enough to list all phase names in one compressed card.
`.trim(),
  },
  {
    id: 'taxonomy-heavy-security',
    title: 'Generic Taxonomy-Heavy Information Security Source',
    sourceType: 'pdf_text',
    expectedMajorSections: [
      'Information Security Definition',
      'CIA Triad',
      'Threats and Attacks',
      'Vulnerability, Exploit, and Breach',
      'Malware and Infected Hosts',
      'Botnets and Zombies',
      'Impact of Security Breaches',
      'Unified Threat Management',
      'Detection, Investigation, and Remediation',
      'Security Practices and Controls',
    ],
    notes:
      'This fixture represents the IT Security-style failure: many definitions and categories, repeated shallow cards, and later taxonomy sections dropped.',
    extractedText: `
INTRODUCTION TO INFORMATION SECURITY

Information security is a set of strategies, processes, tools, and controls used to prevent unauthorized access, misuse, modification, disruption, or destruction of information and information systems. It protects data, users, devices, applications, networks, and services.

Information security is important because organizations depend on accurate, available, and protected information. A failure in security can affect business operations, reputation, legal compliance, financial stability, and customer trust.

INFORMATION SECURITY DEFINITION

Information security focuses on protecting information from unauthorized access, disclosure, alteration, and destruction. It includes administrative, technical, and physical safeguards. Administrative safeguards include policies and procedures. Technical safeguards include authentication, encryption, monitoring, and firewalls. Physical safeguards include locks, facility access controls, and protection of hardware.

CYBERSECURITY AND INFORMATION SECURITY

Cybersecurity is commonly focused on protecting systems, networks, devices, and data from digital attacks. Information security is broader because it includes information in both digital and non-digital forms. In practice, the two fields overlap heavily.

CIA TRIAD

The CIA Triad is a basic model of information security. It consists of Confidentiality, Integrity, and Availability.

Confidentiality means information should be accessible only to authorized users. Examples include passwords, access permissions, encryption, and data classification.

Integrity means information should remain accurate, complete, and trustworthy. Integrity controls prevent unauthorized modification. Examples include checksums, audit logs, version control, and validation rules.

Availability means information and systems should be accessible when needed. Availability controls include backups, redundancy, disaster recovery, failover systems, and maintenance planning.

THREATS AND ATTACKS

A threat is anything that can cause harm to information, systems, or users. Threats may be intentional or accidental. Examples include attackers, malware, insider misuse, natural disasters, power failures, hardware defects, and user error.

An attack is an intentional attempt to exploit a weakness. Attacks may target users, applications, networks, or physical devices. Common attacks include phishing, password attacks, denial of service, malware infection, social engineering, and unauthorized access.

VULNERABILITY, EXPLOIT, AND BREACH

A vulnerability is a weakness or flaw in hardware, software, configuration, process, or human behavior. Vulnerabilities may exist because of outdated software, weak passwords, misconfigured permissions, missing patches, insecure code, or poor training.

An exploit is a method or tool used to take advantage of a vulnerability. Exploits can be manual or automated. Attackers use exploits to gain access, steal data, install malware, or disrupt services.

A breach occurs when an exploit succeeds and security is violated. A breach may involve unauthorized access, data leakage, account compromise, system takeover, or service disruption.

MALWARE

Malware is malicious software designed to damage, disrupt, spy on, or gain unauthorized access to systems. Malware includes viruses, worms, trojans, ransomware, spyware, adware, rootkits, and keyloggers.

A virus attaches to legitimate files and spreads when the file is executed. A worm can spread across networks without needing a host file. A trojan disguises itself as legitimate software. Ransomware encrypts files and demands payment. Spyware collects user information without permission.

INFECTED HOSTS, ZOMBIES, AND BOTNETS

An infected host is a device compromised by malware. A zombie is an infected host controlled remotely by an attacker without the user's knowledge.

A botnet is a network of compromised devices controlled by an attacker. Botnets can be used for denial-of-service attacks, spam campaigns, credential theft, malware distribution, and coordinated attacks.

Zombie hosts are dangerous because the owner may not know the device is being used in attacks. Botnets grow when malware spreads and adds more infected devices to the attacker’s control.

IMPACT OF A SECURITY BREACH

A security breach can cause ruined reputation, vandalism, theft, revenue loss, damaged intellectual property, legal penalties, and loss of customer trust.

Ruined reputation occurs when customers, partners, or the public lose confidence in the organization. Vandalism may involve defaced websites, altered files, or destroyed data. Theft may involve stolen credentials, financial data, personal information, or trade secrets.

Revenue loss can happen when systems are unavailable, customers leave, operations stop, or recovery costs increase. Damaged intellectual property includes stolen designs, source code, research, plans, or confidential business information.

UNIFIED THREAT MANAGEMENT

Unified Threat Management, or UTM, combines multiple security functions into one system or platform. A UTM solution may include firewall, intrusion detection, intrusion prevention, antivirus, content filtering, spam filtering, virtual private network support, and reporting.

UTM helps organizations manage different security controls from a central location. It is useful for small and medium organizations because it simplifies administration. However, UTM must be configured and monitored properly.

DETECTION, INVESTIGATION, AND REMEDIATION

Detection is the process of identifying suspicious activity, policy violations, malware, unauthorized access, or signs of compromise. Detection tools include logs, alerts, endpoint security, network monitoring, intrusion detection systems, and security information and event management systems.

Investigation determines what happened, what systems were affected, how the incident occurred, and what evidence exists. Investigation may include log review, malware analysis, account review, file inspection, network traffic analysis, and timeline reconstruction.

Remediation is the process of fixing the problem and reducing future risk. Remediation may include removing malware, resetting passwords, patching software, changing configurations, restoring backups, blocking malicious addresses, and improving controls.

SECURITY PRACTICES AND CONTROLS

Good security requires layered controls. Authentication verifies identity. Authorization determines what an authenticated user may access. Encryption protects data confidentiality. Backups support availability and recovery. Patching reduces known vulnerabilities. Training reduces human error and social engineering risk.

Access control should follow the principle of least privilege. Users should only have the permissions needed for their role. Multi-factor authentication improves account protection. Monitoring and logging help detect suspicious activity.

POLICIES AND USER RESPONSIBILITIES

Security policies define acceptable use, password requirements, data handling, incident reporting, and access rules. Users are responsible for following policies, protecting credentials, reporting suspicious messages, and avoiding unsafe downloads.

Security is not only a technical issue. People, processes, and technology must work together.
`.trim(),
  },
  {
    id: 'firewalls-and-vpns-chapter2',
    title: 'Firewalls and VPNs — Chapter 2',
    sourceType: 'pdf_text',
    expectedMajorSections: [
      'Learning Objectives',
      'Physical Design',
      'What is a Firewall',
      'Firewall Categorization',
      'Types by Processing Mode',
      'Types by Development Era',
      'Types by Structure',
      'Firewall Architectures',
      'Best Practices for Firewalls',
      'Practice Questions',
      'Answer Key',
    ],
    notes:
      'This fixture represents the Firewalls lecture PDF failure: the AI was generating generic bucket sections (References, Definitions, Terminology, Classifications) with broken fragment headings (Based On, Allows The Router To Pre, Firewall Application Running On A General). The reviewer should follow the source outline, preserve all 12 best practices, include all processing-mode types, and generate practice questions grounded in the source.',
    extractedText: `
Firewalls & VPNs — Chapter 2
Network Security: Firewalls and VPN

Learning Objectives
After completing this chapter, the student should be able to:
1. Define firewall and describe the function it performs in the network.
2. Describe how a firewall can be used to reduce the risks of network attacks.
3. Understand the difference between the types and generations of firewalls.
4. List and describe various firewall architectures.
5. Discuss the best practices for implementing firewalls.

Physical Design
Physical design is the design of actual hardware and software components and the implementation of the logical design. It refers to the physical security, technical controls, and physical design process used to protect the system.

Technical Control
Technical controls are safeguards built into hardware and software to protect and control the flow of information.

Security Technologies
Security technologies include firewalls, intrusion detection systems, and encryption devices. These are implemented as part of the overall physical security design.

Physical Security
Physical security refers to measures used to protect computing hardware and other assets from physical threats such as theft, tampering, or natural disasters. It includes access controls, locks, and surveillance.

Physical Design Process
The physical design process involves the following steps:
1. Identify the protection requirements for each component.
2. Determine which physical security controls are needed.
3. Evaluate the technical architecture requirements.
4. Prepare project plans for the implementation of the design.
5. Review the design with stakeholders for approval.
6. Implement the physical design controls.

What is a Firewall?
A firewall is a device or set of devices designed to permit or deny network transmissions based upon a set of rules. It is used to protect networks from unauthorized access while permitting legitimate communications to pass.

Definition
A firewall examines all traffic routed between two networks to see if it meets certain criteria. If it does, the traffic is routed between the networks; if not, it is stopped.

Possible Firewall Forms
A firewall can take one of the following forms:
• A dedicated hardware appliance
• Software running on a general-purpose computer
• An application built into a router or switch
• A virtual firewall running on a hypervisor or cloud platform

Firewall Categorization
Firewalls can be categorized based on their processing mode, development era, or structure.

Processing Mode
Firewalls can be classified based on the method they use to filter traffic:
• Packet filtering
• Application-level gateways (proxy firewalls)
• Circuit-level gateways
• MAC-layer firewalls
• Hybrids

Development Era
Firewalls can be categorized by their generation:
• First generation — Packet filter / Stateless firewall
• Second generation — Circuit-level / Stateful firewall
• Third generation — Application firewall / Next-Generation Firewall (NGFW)

Structure
Firewalls can also be classified by their commercial deployment structure:
• Commercial grade firewall
• SOHO (Small Office / Home Office) firewall
• Residential grade firewall

Types by Processing Mode

Packet Filtering
A packet-filtering firewall is a network security device that filters packets based on network-layer and transport-layer information. It allows the router to pre-determine which packets to allow through the router. It works by examining the header of each packet and comparing it to a set of predefined rules. It is the simplest and least expensive type of firewall.

Application-Level Gateways / Proxy Firewall
An application-level gateway (also called a proxy firewall) is a firewall that can filter traffic at the application layer of the OSI model. It acts as an intermediary between users and the services they connect to. It can inspect the content of traffic, not just the headers.

Circuit-Level Gateways
A circuit-level gateway works at the session layer of the OSI model. It monitors the handshaking between packets to determine whether a requested session is legitimate. It does not inspect the contents of packets passing through it.

MAC-layer Firewalls
A MAC-layer firewall operates at the data-link layer (Layer 2) of the OSI model. It can be used to restrict access based on MAC addresses of network devices.

Hybrids
A hybrid firewall combines features of multiple firewall types such as packet filtering and application proxy functions into a single system.

Types by Development Era

First Generation / Packet Filter / Stateless
First-generation firewalls are stateless packet filters. They examine each packet in isolation based on network-layer information such as source IP, destination IP, and port. They do not maintain state information about connections.

Second Generation / Circuit-Level / Stateful
Second-generation firewalls are stateful firewalls. They maintain a state table of active connections and use this information to filter packets. A packet is allowed if it is part of an established, known connection.

Third Generation / Application Firewalls / NGFW
Third-generation firewalls operate at the application layer. They can inspect packet payloads and understand application protocols. Next-generation firewalls (NGFW) may include features such as deep packet inspection, intrusion prevention, SSL inspection, and application awareness.

Types by Structure

Commercial Grade
A commercial-grade firewall is a high-performance firewall application running on a general-purpose computer. It is used by large enterprises and can handle high volumes of traffic.

SOHO Firewall
A SOHO (Small Office / Home Office) firewall is a dedicated hardware device designed for smaller environments. It provides basic firewall features suitable for small businesses or home networks.

Residential Grade
A residential-grade firewall is a firewall built into a home router or gateway device. It is typically a basic packet filter.

Firewall Architectures

Packet Filtering Routers
A packet-filtering router is the simplest form of firewall architecture. It allows the router to pre-determine which packets to pass and which to block based on filtering rules. It is the first layer of defense in a network.

Screened Host Firewalls
A screened host firewall is a system using a combination of a packet-filtering router and an application-level gateway (bastion host). Traffic from outside must first pass through the router and then through the bastion host. This provides two layers of protection.

Dual-Homed Firewalls
A dual-homed firewall uses a host with two network interface cards — one connected to the external network and one to the internal network. It acts as a barrier between the two networks. IP forwarding is disabled so that packets cannot be routed automatically between the two interfaces.

Screened Subnet Firewalls / DMZ
A screened subnet firewall (also known as a DMZ architecture) adds an additional layer of security by placing a subnet between the external and internal networks. The DMZ contains servers that must be accessible from the outside. This architecture uses two packet-filtering routers and a bastion host.

Best Practices for Firewalls
The following best practices should be followed when implementing firewalls:
1. All traffic from the trust network to the untrusted network should pass through the firewall.
2. Only authorized traffic, as defined by the local security policy, should be allowed to pass.
3. The firewall itself must be immune to penetration, which implies the use of a hardened system.
4. Use a firewall system that is designed to withstand attacks.
5. All components of the firewall should be located within a physically secure area.
6. Implement the principle of least privilege for all firewall rules.
7. Keep the firewall software up to date with security patches.
8. Log all firewall activity and review logs regularly.
9. Test the firewall rules after implementation to ensure they work as expected.
10. Back up all firewall configurations and store backups securely.
11. Perform regular security audits of the firewall configuration.
12. Establish a process for reviewing and updating firewall rules when network requirements change.

References
Whitman, M. & Mattord, H. (2021). Principles of Information Security. Cengage Learning.
Stallings, W. & Brown, L. (2018). Computer Security: Principles and Practice. Pearson.
`.trim(),
  },
  {
    id: 'short-martial-arts-module',
    title: 'Generic Short Physical Education Martial Arts Module',
    sourceType: 'canvas_page',
    expectedMajorSections: [
      'Definition and Background',
      'Equipment and Weapons',
      'Main Groups or Styles',
      'Courtesy and Salutation',
      'Regional Systems',
    ],
    notes:
      'This fixture represents the shorter PE/Arnis-style source: it should be complete without becoming bloated, and supporting bullets should not all become required major sections.',
    extractedText: `
MODULE 1: ACQUIRE NEW KNOWLEDGE
INDIGENOUS FILIPINO MARTIAL ART AND SPORT

DEFINITION AND BACKGROUND

Arnis is an indigenous Filipino martial art and sport. It is also known in different places as Eskrima, Kali, Garrote, and other regional names. It is practiced with sticks, bladed weapon concepts, empty-hand movements, blocking, striking, footwork, and defensive skills.

Arnis reflects Filipino culture and history because it developed through local fighting systems, regional traditions, and practical self-defense methods. It is both a martial art and a sport.

EQUIPMENT AND WEAPONS

Common equipment and weapons used in Arnis include the baston, yantok, daga, espada y daga, bankaw, and panangga.

The baston or yantok is a stick commonly used in training and competition. The daga represents knife techniques. Espada y daga refers to sword-and-dagger style. Bankaw refers to long staff or spear-like weapon training. Panangga refers to shielding or defensive equipment.

Training equipment helps students practice safely while learning coordination, timing, distance, striking angles, blocking, and control.

MAIN GROUPS OR STYLES

Arnis can be grouped into regional or stylistic traditions. One common classification includes Northern Style, Central Style, and Southern Style.

Northern Style is commonly associated with Arnis. Central Style may be called Arnis de Mano. Southern Style is often associated with Kali.

These classifications show that Filipino martial arts developed differently across regions. Although names and techniques may vary, the systems share principles of movement, defense, weapon handling, timing, and adaptability.

COURTESY AND SALUTATION

Courtesy and respect are important in martial arts training. A salutation may include ready stance, bow, return to ready stance, Handa, and Pugay.

The ready stance prepares the student physically and mentally. The bow shows respect to the instructor, partner, and training space. Handa means ready. Pugay is a gesture of respect.

Courtesy teaches discipline, humility, safety, and proper attitude during practice.

REGIONAL SYSTEMS

Different regions have different names and systems. Pangasinan may use Kalirongan. Tagalog regions may use Pananandata. Ilocanos may refer to Didya or Kabaroan. Ibanags may use Pagkalikali. Pampanguenos may use Sinawali. Visayans may use Kinaadman, Pagaradman, Esgrima, or Escrima.

These regional systems show the diversity of Filipino martial arts. The names may differ, but the practices often include weapon training, body mechanics, defense, offense, timing, and cultural identity.

SUMMARY

A complete review should cover the definition and background of Arnis, equipment and weapons, main groups or styles, courtesy and salutation, and regional systems. It should not duplicate broad cards when a specific section needs direct review coverage.
`.trim(),
  },
]
