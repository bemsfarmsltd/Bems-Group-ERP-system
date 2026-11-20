import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../../models/staff_models.dart';
import '../../../services/staff_api_service.dart';
import '../../../theme/subsidiary_theme.dart';

class HrScheduleScreen extends StatelessWidget {
  final Map<String, dynamic> hrData;

  const HrScheduleScreen({super.key, required this.hrData});

  @override
  Widget build(BuildContext context) {
    final accent = SubsidiaryTheme.current.color;
    final schedule = (hrData['schedule'] as Map<String, dynamic>?) ?? {};
    final offDaysRaw = (schedule['weeklyOffDays']?.toString() ?? '0,6').split(',');
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    final offDays = offDaysRaw
        .map((d) => int.tryParse(d.trim()))
        .where((i) => i != null && i >= 0 && i < 7)
        .map((i) => dayNames[i!])
        .toList();

    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        title: const Text('My Work Schedule & Shifts', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: Color(0xFF0F172A))),
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: const Color(0xFFE2E8F0)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('ASSIGNED SHIFT', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: accent, letterSpacing: 0.6)),
                const SizedBox(height: 10),
                Text(
                  '${schedule['shiftStart'] ?? '08:00'} – ${schedule['shiftEnd'] ?? '17:00'} WAT',
                  style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: Color(0xFF0F172A)),
                ),
                const SizedBox(height: 12),
                _row('Resumption Time', '${schedule['shiftStart'] ?? '08:00'} AM'),
                _row('Closing Time', '${schedule['shiftEnd'] ?? '17:00'}'),
                _row('Grace Period', '${schedule['gracePeriodMinutes'] ?? 30} minutes'),
                _row('Rest Days', offDays.isEmpty ? 'Saturday, Sunday' : offDays.join(', ')),
                _row('Attendance Exemption', schedule['isExempt'] == true ? 'Exempt' : 'Standard Clock-In Required'),
                if (schedule['notes'] != null) _row('Schedule Notes', schedule['notes'].toString()),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class HrSalaryPayslipsScreen extends StatelessWidget {
  final Map<String, dynamic> hrData;
  final void Function(Map<String, dynamic> payslip) onTapPayslip;

  const HrSalaryPayslipsScreen({
    super.key,
    required this.hrData,
    required this.onTapPayslip,
  });

  @override
  Widget build(BuildContext context) {
    final accent = SubsidiaryTheme.current.color;
    final fmt = NumberFormat('#,##0.00');
    final monthPay = (hrData['currentMonthPay'] as Map<String, dynamic>?) ?? {};
    final items = (hrData['payrollItems'] as List?) ?? [];
    String m(dynamic v) => '₦${fmt.format(((v is num ? v : num.tryParse('$v') ?? 0)) / 100)}';

    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        title: const Text('Salary & Payslips', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: Color(0xFF0F172A))),
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: const Color(0xFFE2E8F0)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${monthPay['monthLabel'] ?? 'CURRENT MONTH'} SUMMARY', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: accent)),
                const SizedBox(height: 12),
                _row('Monthly Gross Pay', m(monthPay['grossMonthlyMinor'])),
                _row('Total Deductions', '-${m(monthPay['totalDeductionsMinor'])}'),
                _row('Net Monthly Salary', m(monthPay['netMonthlyMinor'])),
                _row('Already Paid', m(monthPay['alreadyPaidMinor'])),
                _row('Payment Status', monthPay['payrollStatus']?.toString() ?? 'PREPARING'),
                const Divider(),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Remaining to Collect', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 14)),
                    Text(m(monthPay['remainingToCollectMinor']), style: TextStyle(fontWeight: FontWeight.w900, fontSize: 17, color: accent)),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          const Text('Monthly Payslips', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900)),
          const SizedBox(height: 10),
          if (items.isEmpty)
            _emptyBox('No payslips published yet.')
          else
            ...items.map((p) => InkWell(
                  onTap: () => onTapPayslip(Map<String, dynamic>.from(p)),
                  borderRadius: BorderRadius.circular(16),
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: const Color(0xFFE2E8F0)),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(p['period']?.toString() ?? 'Payroll Run', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
                              Text('Net: ${m(p['netMinor'])} · Deductions: ${m(p['deductionsMinor'])}', style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
                            ],
                          ),
                        ),
                        _badge(p['batchStatus']?.toString() ?? 'ISSUED', accent),
                      ],
                    ),
                  ),
                )),
        ],
      ),
    );
  }
}

class HrDeductionsScreen extends StatelessWidget {
  final StaffUser user;
  final Map<String, dynamic> hrData;
  final Future<void> Function(String adjustmentId, String title) onDispute;

  const HrDeductionsScreen({
    super.key,
    required this.user,
    required this.hrData,
    required this.onDispute,
  });

  @override
  Widget build(BuildContext context) {
    final accent = SubsidiaryTheme.current.color;
    final fmt = NumberFormat('#,##0.00');
    final adjustments = (hrData['deductionAdjustments'] as List?) ?? [];
    String m(dynamic v) => '₦${fmt.format(((v is num ? v : num.tryParse('$v') ?? 0)) / 100)}';

    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        title: const Text('Deductions & Salary Adjustments', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: Color(0xFF0F172A))),
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          if (adjustments.isEmpty)
            _emptyBox('No deductions or salary adjustments recorded.')
          else
            ...adjustments.map((d) {
              final status = d['status']?.toString() ?? 'PROPOSED';
              return Container(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: const Color(0xFFE2E8F0)),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('${d['category']} · ${m(d['amountMinor'])}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
                          const SizedBox(height: 2),
                          Text(d['reason']?.toString() ?? '', style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
                          if (d['disputeNote'] != null)
                            Text('Dispute: ${d['disputeNote']}', style: const TextStyle(fontSize: 11.5, color: Color(0xFFDC2626))),
                        ],
                      ),
                    ),
                    if (status == 'PROPOSED')
                      TextButton(
                        onPressed: () => onDispute(d['id'].toString(), d['category'].toString()),
                        child: const Text('Dispute', style: TextStyle(fontWeight: FontWeight.w800)),
                      )
                    else
                      _badge(status, accent),
                  ],
                ),
              );
            }),
        ],
      ),
    );
  }
}

class HrRequestsScreen extends StatelessWidget {
  final StaffUser user;
  final Map<String, dynamic> hrData;
  final Future<void> Function() onRefresh;
  final Future<void> Function({String initialCategory, String initialSubject}) onNewRequest;

  const HrRequestsScreen({
    super.key,
    required this.user,
    required this.hrData,
    required this.onRefresh,
    required this.onNewRequest,
  });

  @override
  Widget build(BuildContext context) {
    final accent = SubsidiaryTheme.current.color;
    final tickets = (hrData['hrTickets'] as List?) ?? [];

    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        title: const Text('My Requests & Approvals', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: Color(0xFF0F172A))),
        actions: [
          TextButton.icon(
            onPressed: () => onNewRequest(),
            icon: const Icon(Icons.add_rounded),
            label: const Text('New', style: TextStyle(fontWeight: FontWeight.w800)),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          if (tickets.isEmpty)
            _emptyBox('No HR requests submitted yet.')
          else
            ...tickets.map((t) {
              final status = t['status']?.toString() ?? 'PENDING';
              return Container(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: const Color(0xFFE2E8F0)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text('${t['referenceCode'] ?? ''} · ${t['subject'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5)),
                        ),
                        _badge(status, accent),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      t['resolutionNote'] != null && t['resolutionNote'].toString().isNotEmpty
                          ? 'HR Note: ${t['resolutionNote']}'
                          : '${t['category']} · ${t['description'] ?? ''}',
                      style: const TextStyle(fontSize: 12, color: Color(0xFF64748B)),
                    ),
                    if (status == 'PENDING')
                      Align(
                        alignment: Alignment.centerRight,
                        child: TextButton(
                          onPressed: () async {
                            await StaffApiService.postHrAction(
                              user: user,
                              payload: {'action': 'WITHDRAW_HR_REQUEST', 'ticketId': t['id'].toString()},
                            );
                            await onRefresh();
                          },
                          child: const Text('Withdraw', style: TextStyle(color: Color(0xFFDC2626), fontWeight: FontWeight.w700, fontSize: 12)),
                        ),
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

class HrDocumentsScreen extends StatelessWidget {
  final StaffUser user;
  final Map<String, dynamic> hrData;
  final Future<void> Function() onRefresh;
  final Future<void> Function(String? url) onOpenUrl;

  const HrDocumentsScreen({
    super.key,
    required this.user,
    required this.hrData,
    required this.onRefresh,
    required this.onOpenUrl,
  });

  @override
  Widget build(BuildContext context) {
    final accent = SubsidiaryTheme.current.color;
    final docs = (hrData['documents'] as List?) ?? [];

    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        title: const Text('My Employment Documents', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: Color(0xFF0F172A))),
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          if (docs.isEmpty)
            _emptyBox('No contracts, offer letters or official documents issued yet.')
          else
            ...docs.map((d) {
              final needsSig = d['requiresSignature'] == true && d['signedAt'] == null;
              return Container(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: const Color(0xFFE2E8F0)),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(d['title']?.toString() ?? 'Document', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5)),
                          Text('${d['docType']} · v${d['version'] ?? 1}', style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
                        ],
                      ),
                    ),
                    IconButton(
                      icon: Icon(Icons.download_rounded, color: accent),
                      onPressed: () => onOpenUrl(d['fileUrl']?.toString()),
                    ),
                    if (needsSig)
                      ElevatedButton(
                        onPressed: () async {
                          await StaffApiService.signHrDocument(user: user, documentId: d['id'].toString());
                          await onRefresh();
                        },
                        style: ElevatedButton.styleFrom(backgroundColor: accent, foregroundColor: Colors.white),
                        child: const Text('Sign', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12)),
                      )
                    else
                      _badge(d['signedAt'] != null ? 'SIGNED' : 'READY', accent),
                  ],
                ),
              );
            }),
        ],
      ),
    );
  }
}

class HrBenefitsScreen extends StatelessWidget {
  final Map<String, dynamic> hrData;
  final VoidCallback onOpenLoans;

  const HrBenefitsScreen({
    super.key,
    required this.hrData,
    required this.onOpenLoans,
  });

  @override
  Widget build(BuildContext context) {
    final accent = SubsidiaryTheme.current.color;
    final agreement = hrData['agreement'] as Map<String, dynamic>?;
    final loans = (hrData['loans'] as List?) ?? [];

    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        title: const Text('Benefits, Welfare & Advances', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: Color(0xFF0F172A))),
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: const Color(0xFFE2E8F0)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('ELIGIBLE ENTITLEMENTS', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: accent)),
                const SizedBox(height: 12),
                _row('Employment Classification', agreement?['agreementType']?.toString() ?? 'PERMANENT'),
                _row('Health Insurance (HMO)', 'Company Enrolled'),
                _row('Pension Contribution', 'Statutory Active'),
                _row('Annual Leave Entitlement', '20 Working Days / Year'),
              ],
            ),
          ),
          const SizedBox(height: 14),
          InkWell(
            onTap: onOpenLoans,
            borderRadius: BorderRadius.circular(18),
            child: Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: const Color(0xFFE2E8F0)),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Loans & Salary Advances', style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w900)),
                      Text('${loans.length} active or past applications · Tap to manage', style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
                    ],
                  ),
                  Icon(Icons.arrow_forward_rounded, color: accent),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

Widget _row(String label, String value) => Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(fontSize: 12.5, color: Color(0xFF64748B), fontWeight: FontWeight.w600)),
          Flexible(child: Text(value, textAlign: TextAlign.right, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: Color(0xFF0F172A)))),
        ],
      ),
    );

Widget _emptyBox(String msg) => Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: const Color(0xFFE2E8F0))),
      child: Text(msg, style: const TextStyle(fontSize: 12.5, color: Color(0xFF64748B))),
    );

Widget _badge(String text, Color accent) {
  final s = text.toUpperCase();
  final ok = s == 'PAID' || s == 'DISBURSED' || s == 'SIGNED' || s == 'READY' || s == 'APPROVED' || s == 'RESOLVED';
  final color = ok ? const Color(0xFF059669) : accent;
  return Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
    decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(999)),
    child: Text(s, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: color)),
  );
}
