import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../../models/staff_models.dart';
import '../../../services/staff_api_service.dart';
import '../../../theme/subsidiary_theme.dart';

class HrPerformanceScreen extends StatefulWidget {
  final StaffUser user;
  final Map<String, dynamic> hrData;
  final Future<void> Function() onRefresh;

  const HrPerformanceScreen({
    super.key,
    required this.user,
    required this.hrData,
    required this.onRefresh,
  });

  @override
  State<HrPerformanceScreen> createState() => _HrPerformanceScreenState();
}

class _HrPerformanceScreenState extends State<HrPerformanceScreen> {
  Future<void> _submitSelfAppraisal(String evalId, String cycleTitle) async {
    final ctrl = TextEditingController();
    bool sending = false;
    await showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDlg) => AlertDialog(
          backgroundColor: Colors.white,
          title: Text('Self-Appraisal · $cycleTitle', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
          content: TextField(
            controller: ctrl,
            maxLines: 4,
            decoration: const InputDecoration(
              labelText: 'Achievements, challenges & employee comments',
              border: OutlineInputBorder(),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
            ElevatedButton(
              onPressed: sending
                  ? null
                  : () async {
                      if (ctrl.text.trim().isEmpty) return;
                      setDlg(() => sending = true);
                      await StaffApiService.postHrAction(
                        user: widget.user,
                        payload: {
                          'action': 'SUBMIT_SELF_APPRAISAL',
                          'evaluationId': evalId,
                          'employeeComment': ctrl.text.trim(),
                        },
                      );
                      if (ctx.mounted) Navigator.pop(ctx);
                      await widget.onRefresh();
                    },
              style: ElevatedButton.styleFrom(backgroundColor: SubsidiaryTheme.current.color, foregroundColor: Colors.white),
              child: Text(sending ? 'Saving...' : 'Submit'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final accent = SubsidiaryTheme.current.color;
    final perf = (widget.hrData['performance'] as Map<String, dynamic>?) ?? {};
    final probation = (widget.hrData['probation'] as Map<String, dynamic>?) ?? {};
    final kpis = (perf['kpis'] as List?) ?? [];
    final evals = (perf['evaluations'] as List?) ?? [];
    final pips = (perf['pips'] as List?) ?? [];

    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        title: const Text('Performance, KPIs & Probation', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: Color(0xFF0F172A))),
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          _card(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Probation & Confirmation', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w900)),
                    _pill(probation['status']?.toString() ?? 'ACTIVE', accent),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  'Employment Type: ${probation['employmentType'] ?? 'FULL_TIME'}',
                  style: const TextStyle(fontSize: 12.5, color: Color(0xFF64748B)),
                ),
                if (probation['expectedReviewDate'] != null)
                  Text(
                    '90-Day Review Milestone: ${DateFormat('d MMM yyyy').format(DateTime.parse(probation['expectedReviewDate'].toString()).toLocal())}',
                    style: const TextStyle(fontSize: 12.5, color: Color(0xFF64748B)),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          const Text('Assigned KPIs', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900)),
          const SizedBox(height: 8),
          if (kpis.isEmpty)
            _empty('No individual KPIs assigned yet.')
          else
            ...kpis.map((k) => _card(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(child: Text(k['title']?.toString() ?? '', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5))),
                          _pill('${k['weightPercent'] ?? 0}%', accent),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text('Target: ${k['targetMetric'] ?? '—'} · ${k['reviewPeriod'] ?? 'QUARTERLY'}', style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
                    ],
                  ),
                )),
          const SizedBox(height: 16),
          const Text('Appraisals & Reviews', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900)),
          const SizedBox(height: 8),
          if (evals.isEmpty)
            _empty('No performance evaluations recorded yet.')
          else
            ...evals.map((e) => _card(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(child: Text('${e['cycleTitle']} · Score: ${e['overallScore']}', style: const TextStyle(fontWeight: FontWeight.w800))),
                          _pill(e['status']?.toString() ?? 'SUBMITTED', accent),
                        ],
                      ),
                      if (e['reviewerSummary'] != null) ...[
                        const SizedBox(height: 6),
                        Text('Reviewer (${e['reviewerName']}): ${e['reviewerSummary']}', style: const TextStyle(fontSize: 12, color: Color(0xFF334155))),
                      ],
                      if (e['employeeComment'] != null) ...[
                        const SizedBox(height: 4),
                        Text('My Comment: ${e['employeeComment']}', style: const TextStyle(fontSize: 12, color: Color(0xFF059669))),
                      ] else
                        Align(
                          alignment: Alignment.centerRight,
                          child: TextButton(
                            onPressed: () => _submitSelfAppraisal(e['id'].toString(), e['cycleTitle'].toString()),
                            child: const Text('Submit Self-Appraisal', style: TextStyle(fontWeight: FontWeight.w800)),
                          ),
                        ),
                    ],
                  ),
                )),
          if (pips.isNotEmpty) ...[
            const SizedBox(height: 16),
            const Text('Performance Improvement Plans', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900)),
            const SizedBox(height: 8),
            ...pips.map((p) => _card(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('PIP (${p['startDate']} → ${p['endDate']})', style: const TextStyle(fontWeight: FontWeight.w800)),
                      const SizedBox(height: 4),
                      Text(p['goalsSummary']?.toString() ?? '', style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
                    ],
                  ),
                )),
          ],
        ],
      ),
    );
  }
}

class HrLoansScreen extends StatefulWidget {
  final StaffUser user;
  final Map<String, dynamic> hrData;
  final Future<void> Function() onRefresh;

  const HrLoansScreen({
    super.key,
    required this.user,
    required this.hrData,
    required this.onRefresh,
  });

  @override
  State<HrLoansScreen> createState() => _HrLoansScreenState();
}

class _HrLoansScreenState extends State<HrLoansScreen> {
  final NumberFormat _fmt = NumberFormat('#,##0.00');

  Future<void> _applyLoan() async {
    String loanType = 'SALARY_ADVANCE';
    final amountCtrl = TextEditingController();
    final tenureCtrl = TextEditingController(text: '3');
    final reasonCtrl = TextEditingController();
    bool submitting = false;

    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModal) => Padding(
          padding: EdgeInsets.only(left: 20, right: 20, top: 20, bottom: MediaQuery.of(ctx).viewInsets.bottom + 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('Apply for Loan / Salary Advance', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                value: loanType,
                decoration: InputDecoration(labelText: 'Type', border: OutlineInputBorder(borderRadius: BorderRadius.circular(12))),
                items: const [
                  DropdownMenuItem(value: 'SALARY_ADVANCE', child: Text('Salary Advance')),
                  DropdownMenuItem(value: 'STAFF_LOAN', child: Text('Staff Loan')),
                  DropdownMenuItem(value: 'EMERGENCY', child: Text('Emergency Loan')),
                ],
                onChanged: (v) => setModal(() => loanType = v ?? 'SALARY_ADVANCE'),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    flex: 2,
                    child: TextField(
                      controller: amountCtrl,
                      keyboardType: TextInputType.number,
                      decoration: InputDecoration(labelText: 'Amount (₦)', border: OutlineInputBorder(borderRadius: BorderRadius.circular(12))),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: TextField(
                      controller: tenureCtrl,
                      keyboardType: TextInputType.number,
                      decoration: InputDecoration(labelText: 'Months', border: OutlineInputBorder(borderRadius: BorderRadius.circular(12))),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              TextField(
                controller: reasonCtrl,
                maxLines: 2,
                decoration: InputDecoration(labelText: 'Reason', border: OutlineInputBorder(borderRadius: BorderRadius.circular(12))),
              ),
              const SizedBox(height: 14),
              ElevatedButton(
                onPressed: submitting
                    ? null
                    : () async {
                        final amt = double.tryParse(amountCtrl.text.trim()) ?? 0;
                        final months = int.tryParse(tenureCtrl.text.trim()) ?? 1;
                        if (amt <= 0 || reasonCtrl.text.trim().isEmpty) return;
                        setModal(() => submitting = true);
                        await StaffApiService.postHrAction(
                          user: widget.user,
                          payload: {
                            'action': 'REQUEST_LOAN_OR_ADVANCE',
                            'loanType': loanType,
                            'amountNaira': amt,
                            'tenureMonths': months,
                            'reason': reasonCtrl.text.trim(),
                          },
                        );
                        if (ctx.mounted) Navigator.pop(ctx);
                        await widget.onRefresh();
                      },
                style: ElevatedButton.styleFrom(
                  backgroundColor: SubsidiaryTheme.current.color,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                child: Text(submitting ? 'Submitting...' : 'Submit Application', style: const TextStyle(fontWeight: FontWeight.w800)),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final accent = SubsidiaryTheme.current.color;
    final loans = (widget.hrData['loans'] as List?) ?? [];

    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        title: const Text('Loans & Salary Advances', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: Color(0xFF0F172A))),
        actions: [
          TextButton.icon(
            onPressed: _applyLoan,
            icon: const Icon(Icons.add_rounded),
            label: const Text('Apply', style: TextStyle(fontWeight: FontWeight.w800)),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          if (loans.isEmpty)
            _empty('No active or past loan / salary advance applications.')
          else
            ...loans.map((l) {
              final principal = ((l['principalMinor'] ?? 0) as num) / 100;
              final monthly = ((l['monthlyInstallmentMinor'] ?? 0) as num) / 100;
              final rem = ((l['remainingBalanceMinor'] ?? 0) as num) / 100;
              final isDisbursed = l['isDisbursed'] == true;
              return _card(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('${l['loanType']} · ₦${_fmt.format(principal)}', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 14)),
                        _pill(l['status']?.toString() ?? 'PENDING', accent),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Disbursement: ${isDisbursed ? 'Confirmed by Finance' : 'Not Disbursed Yet'} · Tenure: ${l['tenureMonths']} mos',
                      style: const TextStyle(fontSize: 12, color: Color(0xFF64748B), fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Monthly Instalment: ₦${_fmt.format(monthly)} · Outstanding: ₦${_fmt.format(rem)}',
                      style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: accent),
                    ),
                  ],
                ),
              );
            }),
        ],
      ),
    );
  }
}

class HrCasesScreen extends StatefulWidget {
  final StaffUser user;
  final Map<String, dynamic> hrData;
  final Future<void> Function() onRefresh;

  const HrCasesScreen({
    super.key,
    required this.user,
    required this.hrData,
    required this.onRefresh,
  });

  @override
  State<HrCasesScreen> createState() => _HrCasesScreenState();
}

class _HrCasesScreenState extends State<HrCasesScreen> {
  Future<void> _respondQuery(String caseId, String caseNumber) async {
    final ctrl = TextEditingController();
    bool sending = false;
    await showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDlg) => AlertDialog(
          backgroundColor: Colors.white,
          title: Text('Respond to $caseNumber', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                'Submitted responses are versioned and immutable once sent.',
                style: TextStyle(fontSize: 12, color: Color(0xFF64748B)),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: ctrl,
                maxLines: 4,
                decoration: const InputDecoration(labelText: 'Written Explanation', border: OutlineInputBorder()),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
            ElevatedButton(
              onPressed: sending
                  ? null
                  : () async {
                      if (ctrl.text.trim().isEmpty) return;
                      setDlg(() => sending = true);
                      await StaffApiService.postHrAction(
                        user: widget.user,
                        payload: {
                          'action': 'RESPOND_DISCIPLINARY',
                          'caseId': caseId,
                          'employeeResponse': ctrl.text.trim(),
                        },
                      );
                      if (ctx.mounted) Navigator.pop(ctx);
                      await widget.onRefresh();
                    },
              style: ElevatedButton.styleFrom(backgroundColor: SubsidiaryTheme.current.color, foregroundColor: Colors.white),
              child: Text(sending ? 'Sending...' : 'Submit Response'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _submitGrievance() async {
    String cat = 'WORKING_CONDITIONS';
    bool confidential = true;
    final ctrl = TextEditingController();
    bool sending = false;
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModal) => Padding(
          padding: EdgeInsets.only(left: 20, right: 20, top: 20, bottom: MediaQuery.of(ctx).viewInsets.bottom + 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('Submit Confidential Grievance / Welfare Report', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900)),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                value: cat,
                decoration: InputDecoration(labelText: 'Category', border: OutlineInputBorder(borderRadius: BorderRadius.circular(12))),
                items: const [
                  DropdownMenuItem(value: 'HARASSMENT', child: Text('Workplace Harassment')),
                  DropdownMenuItem(value: 'DISCRIMINATION', child: Text('Unfair Treatment / Discrimination')),
                  DropdownMenuItem(value: 'PAY_DISPUTE', child: Text('Salary / Welfare Concern')),
                  DropdownMenuItem(value: 'SAFETY', child: Text('Safety / Working Conditions')),
                  DropdownMenuItem(value: 'MANAGEMENT_CONDUCT', child: Text('Management Conduct (Bypass Manager)')),
                  DropdownMenuItem(value: 'OTHER', child: Text('Other HR Concern')),
                ],
                onChanged: (v) => setModal(() => cat = v ?? 'OTHER'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: ctrl,
                maxLines: 3,
                decoration: InputDecoration(labelText: 'Incident Details & Requested Resolution', border: OutlineInputBorder(borderRadius: BorderRadius.circular(12))),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Restrict to Confidential HR Reviewers', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
                value: confidential,
                onChanged: (v) => setModal(() => confidential = v),
              ),
              ElevatedButton(
                onPressed: sending
                    ? null
                    : () async {
                        if (ctrl.text.trim().isEmpty) return;
                        setModal(() => sending = true);
                        await StaffApiService.postHrAction(
                          user: widget.user,
                          payload: {
                            'action': 'SUBMIT_GRIEVANCE',
                            'category': cat,
                            'summary': ctrl.text.trim(),
                            'isConfidential': confidential,
                          },
                        );
                        if (ctx.mounted) Navigator.pop(ctx);
                        await widget.onRefresh();
                      },
                style: ElevatedButton.styleFrom(
                  backgroundColor: SubsidiaryTheme.current.color,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                child: Text(sending ? 'Submitting...' : 'Submit Grievance', style: const TextStyle(fontWeight: FontWeight.w800)),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final accent = SubsidiaryTheme.current.color;
    final queries = (widget.hrData['disciplinaryCases'] as List?) ?? [];
    final grievances = (widget.hrData['grievances'] as List?) ?? [];

    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        title: const Text('HR Queries & Grievances', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: Color(0xFF0F172A))),
        actions: [
          TextButton.icon(
            onPressed: _submitGrievance,
            icon: const Icon(Icons.shield_outlined),
            label: const Text('Report Concern', style: TextStyle(fontWeight: FontWeight.w800)),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Text('Formal HR Queries & Notices', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900)),
          const SizedBox(height: 8),
          if (queries.isEmpty)
            _empty('No formal HR queries or disciplinary notices.')
          else
            ...queries.map((q) => _card(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('${q['caseNumber']} · ${q['severity']}', style: const TextStyle(fontWeight: FontWeight.w900)),
                          _pill(q['step']?.toString() ?? 'QUERY_ISSUED', accent),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text(q['queryText']?.toString() ?? q['allegation']?.toString() ?? '', style: const TextStyle(fontSize: 12.5)),
                      if (q['employeeResponse'] != null) ...[
                        const SizedBox(height: 6),
                        Text('Your Response: ${q['employeeResponse']}', style: const TextStyle(fontSize: 12, color: Color(0xFF059669), fontWeight: FontWeight.w600)),
                      ] else
                        Align(
                          alignment: Alignment.centerRight,
                          child: TextButton(
                            onPressed: () => _respondQuery(q['id'].toString(), q['caseNumber'].toString()),
                            child: const Text('Respond Now', style: TextStyle(fontWeight: FontWeight.w800)),
                          ),
                        ),
                    ],
                  ),
                )),
          const SizedBox(height: 18),
          const Text('My Confidential Grievances', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900)),
          const SizedBox(height: 8),
          if (grievances.isEmpty)
            _empty('No grievance or welfare cases submitted.')
          else
            ...grievances.map((g) => _card(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('${g['ticketCode']} · ${g['category']}', style: const TextStyle(fontWeight: FontWeight.w800)),
                          _pill(g['status']?.toString() ?? 'OPEN', accent),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(g['summary']?.toString() ?? '', style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
                    ],
                  ),
                )),
        ],
      ),
    );
  }
}

class HrWorkspaceDirectoryScreen extends StatelessWidget {
  final StaffUser user;
  final Map<String, dynamic> hrData;
  final Future<void> Function() onRefresh;
  final Future<void> Function({String initialCategory, String initialSubject}) onOpenTicket;

  const HrWorkspaceDirectoryScreen({
    super.key,
    required this.user,
    required this.hrData,
    required this.onRefresh,
    required this.onOpenTicket,
  });

  @override
  Widget build(BuildContext context) {
    final accent = SubsidiaryTheme.current.color;
    final training = (hrData['training'] as Map<String, dynamic>?) ?? {};
    final assignments = (training['assignments'] as List?) ?? [];
    final policies = (hrData['policies'] as List?) ?? [];
    final announcements = (hrData['announcements'] as List?) ?? [];
    final career = (hrData['careerHistory'] as List?) ?? [];
    final exitClearance = hrData['exitClearance'] as Map<String, dynamic>?;

    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        title: const Text('Learning, Policies, Career & Exit', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: Color(0xFF0F172A))),
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Text('HR Announcements', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900)),
          const SizedBox(height: 8),
          if (announcements.isEmpty)
            _empty('No HR announcements right now.')
          else
            ...announcements.map((a) => _card(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(child: Text(a['title']?.toString() ?? '', style: const TextStyle(fontWeight: FontWeight.w800))),
                          _pill(a['category']?.toString() ?? 'HR', accent),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(a['content']?.toString() ?? '', style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
                    ],
                  ),
                )),
          const SizedBox(height: 16),
          const Text('Company Policies & Acknowledgements', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900)),
          const SizedBox(height: 8),
          if (policies.isEmpty)
            _empty('No policy documents awaiting acknowledgement.')
          else
            ...policies.map((p) => _card(
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(p['title']?.toString() ?? '', style: const TextStyle(fontWeight: FontWeight.w800)),
                            Text('Version ${p['version'] ?? 1}', style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
                          ],
                        ),
                      ),
                      if (p['requiresSignature'] == true && p['signedAt'] == null)
                        ElevatedButton(
                          onPressed: () async {
                            await StaffApiService.signHrDocument(user: user, documentId: p['id'].toString());
                            await onRefresh();
                          },
                          style: ElevatedButton.styleFrom(backgroundColor: accent, foregroundColor: Colors.white),
                          child: const Text('Acknowledge'),
                        )
                      else
                        _pill('ACKNOWLEDGED', accent),
                    ],
                  ),
                )),
          const SizedBox(height: 16),
          const Text('Training & Development', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900)),
          const SizedBox(height: 8),
          if (assignments.isEmpty)
            _empty('No training courses assigned yet.')
          else
            ...assignments.map((t) {
              final course = (t['course'] as Map<String, dynamic>?) ?? {};
              final done = t['status'] == 'COMPLETED';
              return _card(
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(course['title']?.toString() ?? 'Training', style: const TextStyle(fontWeight: FontWeight.w800)),
                          Text('${course['category'] ?? 'GENERAL'} · ${course['durationHours'] ?? 2}h', style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
                        ],
                      ),
                    ),
                    if (!done)
                      TextButton(
                        onPressed: () async {
                          await StaffApiService.postHrAction(
                            user: user,
                            payload: {'action': 'COMPLETE_TRAINING', 'assignmentId': t['id'].toString()},
                          );
                          await onRefresh();
                        },
                        child: const Text('Mark Complete', style: TextStyle(fontWeight: FontWeight.w800)),
                      )
                    else
                      _pill('COMPLETED', accent),
                  ],
                ),
              );
            }),
          const SizedBox(height: 16),
          const Text('Career Timeline & Assignments', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900)),
          const SizedBox(height: 8),
          ...career.map((c) => _card(
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(c['positionName']?.toString() ?? '', style: const TextStyle(fontWeight: FontWeight.w800)),
                          Text('${c['departmentName']} · ${c['subsidiaryName']}', style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
                        ],
                      ),
                    ),
                    _pill(c['status']?.toString() ?? 'ACTIVE', accent),
                  ],
                ),
              )),
          const SizedBox(height: 16),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Resignation, Exit & Clearance', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900)),
              if (exitClearance == null)
                TextButton(
                  onPressed: () {
                    Navigator.pop(context);
                    onOpenTicket(
                      initialCategory: 'RESIGNATION_EXIT',
                      initialSubject: 'Resignation Notice (${user.employeeNumber})',
                    );
                  },
                  child: const Text('Submit Notice', style: TextStyle(fontWeight: FontWeight.w800, color: Color(0xFFDC2626))),
                ),
            ],
          ),
          const SizedBox(height: 8),
          if (exitClearance == null)
            _empty('No active resignation or exit clearance process.')
          else
            _card(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Ref: ${exitClearance['referenceCode']}', style: const TextStyle(fontWeight: FontWeight.w900)),
                      _pill(exitClearance['status']?.toString() ?? 'PENDING', accent),
                    ],
                  ),
                  const SizedBox(height: 10),
                  ...((exitClearance['departments'] as List?) ?? []).map((d) => Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Expanded(child: Text('${d['name']} · ${d['requirement']}', style: const TextStyle(fontSize: 12))),
                            _pill(d['status']?.toString() ?? 'PENDING', accent),
                          ],
                        ),
                      )),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

Widget _card({required Widget child}) => Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: child,
    );

Widget _empty(String text, {IconData icon = Icons.inbox_outlined, String? actionLabel, VoidCallback? onAction}) => Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 28),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        children: [
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              color: const Color(0xFFF1F5F9),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(icon, size: 22, color: const Color(0xFF64748B)),
          ),
          const SizedBox(height: 12),
          Text(
            text,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: Color(0xFF334155)),
          ),
          if (actionLabel != null && onAction != null) ...[
            const SizedBox(height: 12),
            ElevatedButton(
              onPressed: onAction,
              style: ElevatedButton.styleFrom(
                backgroundColor: SubsidiaryTheme.current.color,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: Text(actionLabel, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5)),
            ),
          ],
        ],
      ),
    );

Widget _pill(String text, Color accent) {
  final s = text.toUpperCase();
  final ok = s == 'COMPLETED' || s == 'CLEARED' || s == 'CONFIRMED' || s == 'ACKNOWLEDGED' || s == 'ACTIVE' || s == 'APPROVED';
  final color = ok ? const Color(0xFF059669) : accent;
  return Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
    decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(999)),
    child: Text(s, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: color)),
  );
}
