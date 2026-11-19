import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../models/staff_models.dart';
import '../../services/staff_api_service.dart';
import '../../theme/subsidiary_theme.dart';
import '../attendance_scan_screen.dart';
import '../attendance_monthly_screen.dart';
import 'hr/hr_secondary_views.dart';
import 'hr/hr_directory_views.dart';
import 'hr/digital_id_card_screen.dart';

class StaffHrScreen extends StatefulWidget {
  final StaffUser user;

  const StaffHrScreen({super.key, required this.user});

  @override
  State<StaffHrScreen> createState() => _StaffHrScreenState();
}

class _StaffHrScreenState extends State<StaffHrScreen> {
  final PageController _pageController = PageController();
  final NumberFormat _moneyFmt = NumberFormat('#,##0.00');
  int _currentIndex = 0;
  bool _loading = true;
  String? _error;
  Map<String, dynamic> _hrData = {};
  DateTime _calendarMonth = DateTime(DateTime.now().year, DateTime.now().month, 1);
  String? _selectedDateKey;

  @override
  void initState() {
    super.initState();
    _loadHrData();
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  void _navigateToTab(int index) {
    if (_currentIndex == index) return;
    setState(() => _currentIndex = index);
    if (_pageController.hasClients) {
      _pageController.animateToPage(
        index,
        duration: const Duration(milliseconds: 260),
        curve: Curves.easeInOut,
      );
    }
  }

  Future<void> _loadHrData() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await StaffApiService.fetchMyHrWorkspace(widget.user);
      if (!mounted) return;
      setState(() {
        _hrData = data;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  String _fmtMinor(dynamic minor, [String currency = 'NGN']) {
    final val = (minor is num ? minor.toDouble() : double.tryParse('$minor') ?? 0) / 100.0;
    final symbol = currency.toUpperCase() == 'USD' ? '\$' : '₦';
    return '$symbol${_moneyFmt.format(val)}';
  }

  String _fmtTimeWat(dynamic iso) {
    if (iso == null) return '—';
    final dt = DateTime.tryParse(iso.toString())?.toUtc().add(const Duration(hours: 1));
    if (dt == null) return iso.toString();
    return DateFormat('hh:mm a').format(dt);
  }

  String _fmtWorkDate(dynamic workDate) {
    if (workDate == null) return '—';
    final dt = DateTime.tryParse(workDate.toString());
    if (dt == null) return workDate.toString();
    return DateFormat('EEE, d MMM yyyy').format(dt);
  }

  String _fmtShortDate(dynamic iso) {
    if (iso == null) return '—';
    final dt = DateTime.tryParse(iso.toString());
    if (dt == null) return iso.toString();
    return DateFormat('d MMM yyyy').format(dt.toLocal());
  }

  Future<void> _openDocumentUrl(String? rawUrl) async {
    if (rawUrl == null || rawUrl.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Document file URL is not available yet.')),
      );
      return;
    }
    final resolved = StaffApiService.resolveUrl(rawUrl.trim());
    final uri = Uri.tryParse(resolved);
    if (uri != null && await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } else if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Unable to open file: $resolved')),
      );
    }
  }

  Future<void> _openAttendanceScanner({required bool isCheckIn}) async {
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => AttendanceScanScreen(
          currentUser: widget.user,
          isCheckIn: isCheckIn,
        ),
      ),
    );
    if (mounted) await _loadHrData();
  }

  void _openProfileModal() {
    final accent = SubsidiaryTheme.current.color;
    final profile = (_hrData['profile'] as Map<String, dynamic>?) ?? {};
    final agreement = _hrData['agreement'] as Map<String, dynamic>?;

    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => Scaffold(
          backgroundColor: const Color(0xFFF8FAFC),
          appBar: AppBar(
            backgroundColor: Colors.white,
            elevation: 0,
            surfaceTintColor: Colors.transparent,
            title: const Text(
              'Staff Profile & Employment Dossier',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: Color(0xFF0F172A)),
            ),
            leading: IconButton(
              icon: const Icon(Icons.arrow_back_rounded, color: Color(0xFF0F172A)),
              onPressed: () => Navigator.pop(context),
            ),
            actions: [
              TextButton.icon(
                onPressed: () => _showEditContactModal(profile),
                icon: const Icon(Icons.edit_outlined, size: 16),
                label: const Text('Edit Contact', style: TextStyle(fontWeight: FontWeight.w800)),
              ),
            ],
          ),
          body: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: const Color(0xFFE2E8F0)),
                ),
                child: Row(
                  children: [
                    StaffAvatar(
                      avatarUrl: profile['avatarUrl']?.toString() ?? widget.user.avatarUrl,
                      fullName: profile['legalName']?.toString() ?? widget.user.fullName,
                      radius: 30,
                      borderRadius: 16,
                      accentColor: accent,
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            profile['legalName']?.toString() ?? widget.user.fullName,
                            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: Color(0xFF0F172A)),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            '${profile['jobTitle'] ?? 'Staff Member'} · ${profile['departmentName'] ?? 'Operations'}',
                            style: const TextStyle(fontSize: 12.5, color: Color(0xFF64748B), fontWeight: FontWeight.w600),
                          ),
                          const SizedBox(height: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(
                              color: accent.withOpacity(0.1),
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text(
                              '${profile['employeeNumber'] ?? widget.user.employeeNumber} · ${profile['subsidiaryName'] ?? 'BEMS Group'}',
                              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: accent),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              _profileSection('Contact & Location', [
                _profileRow('Work Email', profile['workEmail']?.toString() ?? widget.user.email),
                _profileRow('Phone Number', profile['phone']?.toString() ?? 'Not set'),
                _profileRow('Work Location', profile['workLocation']?.toString() ?? 'Headquarters'),
                _profileRow('Address', profile['residentialAddress']?.toString() ?? 'Not provided'),
                _profileRow('City / State', profile['cityState']?.toString() ?? '—'),
              ]),
              const SizedBox(height: 14),
              _profileSection('Employment & Contract Terms', [
                _profileRow('Employment Type', (agreement?['agreementType'] ?? profile['employmentType'] ?? 'FULL_TIME').toString()),
                _profileRow('Payment Model', (agreement?['paymentModel'] ?? 'GROUP_PAID').toString()),
                _profileRow('Staff Grade', profile['staffGrade']?.toString() ?? 'Standard'),
                _profileRow('Resumption Date', _fmtShortDate(agreement?['startDate'] ?? profile['resumptionDate'])),
                if (agreement != null)
                  _profileRow(
                    'Contracted Monthly Gross',
                    _fmtMinor(agreement['grossMinor'], agreement['currency']?.toString() ?? 'NGN'),
                  ),
              ]),
              const SizedBox(height: 14),
              _profileSection('Salary & Payroll Bank Account', [
                _profileRow('Bank Name', profile['bankName']?.toString() ?? 'Not set'),
                _profileRow('Account Number', profile['accountNumber']?.toString() ?? 'Not set'),
                _profileRow('Account Name', profile['accountName']?.toString() ?? 'Not set'),
              ]),
              const SizedBox(height: 14),
              _profileSection('Emergency / Next of Kin', [
                _profileRow('Full Name', profile['nextOfKinName']?.toString() ?? 'Not set'),
                _profileRow('Relationship', profile['nextOfKinRelationship']?.toString() ?? '—'),
                _profileRow('Phone', profile['nextOfKinPhone']?.toString() ?? 'Not set'),
              ]),
              const SizedBox(height: 14),
              OutlinedButton.icon(
                onPressed: () {
                  Navigator.pop(context);
                  _showHrTicketModal(
                    initialCategory: 'INFO_CORRECTION',
                    initialSubject: 'Verified Profile / Bank Account Correction (${widget.user.employeeNumber})',
                  );
                },
                icon: const Icon(Icons.verified_user_outlined, size: 17),
                label: const Text('Request Name / Bank / Role Correction', style: TextStyle(fontWeight: FontWeight.w800)),
                style: OutlinedButton.styleFrom(
                  foregroundColor: const Color(0xFF0F172A),
                  side: const BorderSide(color: Color(0xFFE2E8F0)),
                  padding: const EdgeInsets.symmetric(vertical: 13),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _showEditContactModal(Map<String, dynamic> profile) async {
    final phoneCtrl = TextEditingController(text: profile['phone']?.toString() ?? '');
    final addrCtrl = TextEditingController(text: profile['residentialAddress']?.toString() ?? '');
    final cityCtrl = TextEditingController(text: profile['cityState']?.toString() ?? '');
    final nokNameCtrl = TextEditingController(text: profile['nextOfKinName']?.toString() ?? '');
    final nokPhoneCtrl = TextEditingController(text: profile['nextOfKinPhone']?.toString() ?? '');
    final nokRelCtrl = TextEditingController(text: profile['nextOfKinRelationship']?.toString() ?? '');
    bool saving = false;

    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModal) => Padding(
          padding: EdgeInsets.only(left: 20, right: 20, top: 20, bottom: MediaQuery.of(ctx).viewInsets.bottom + 24),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text('Update Contact & Emergency Details', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
                const SizedBox(height: 12),
                TextField(controller: phoneCtrl, decoration: InputDecoration(labelText: 'Phone Number', border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)))),
                const SizedBox(height: 10),
                TextField(controller: addrCtrl, decoration: InputDecoration(labelText: 'Residential Address', border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)))),
                const SizedBox(height: 10),
                TextField(controller: cityCtrl, decoration: InputDecoration(labelText: 'City / State', border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)))),
                const SizedBox(height: 10),
                TextField(controller: nokNameCtrl, decoration: InputDecoration(labelText: 'Next of Kin Name', border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)))),
                const SizedBox(height: 10),
                TextField(controller: nokRelCtrl, decoration: InputDecoration(labelText: 'Relationship', border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)))),
                const SizedBox(height: 10),
                TextField(controller: nokPhoneCtrl, decoration: InputDecoration(labelText: 'Next of Kin Phone', border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)))),
                const SizedBox(height: 14),
                ElevatedButton(
                  onPressed: saving
                      ? null
                      : () async {
                          setModal(() => saving = true);
                          await StaffApiService.postHrAction(
                            user: widget.user,
                            payload: {
                              'action': 'UPDATE_PROFILE_CONTACT',
                              'phone': phoneCtrl.text.trim(),
                              'residentialAddress': addrCtrl.text.trim(),
                              'cityState': cityCtrl.text.trim(),
                              'nextOfKinName': nokNameCtrl.text.trim(),
                              'nextOfKinRelationship': nokRelCtrl.text.trim(),
                              'nextOfKinPhone': nokPhoneCtrl.text.trim(),
                            },
                          );
                          if (ctx.mounted) Navigator.pop(ctx);
                          await _loadHrData();
                        },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: SubsidiaryTheme.current.color,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                  child: Text(saving ? 'Saving...' : 'Save Changes', style: const TextStyle(fontWeight: FontWeight.w800)),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _profileSection(String title, List<Widget> rows) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w900, color: Color(0xFF0F172A))),
          const SizedBox(height: 12),
          ...rows,
        ],
      ),
    );
  }

  Widget _profileRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 135,
            child: Text(label, style: const TextStyle(fontSize: 12, color: Color(0xFF64748B), fontWeight: FontWeight.w600)),
          ),
          Expanded(
            child: Text(
              value.isEmpty ? '—' : value,
              textAlign: TextAlign.right,
              style: const TextStyle(fontSize: 12.5, color: Color(0xFF0F172A), fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    );
  }

  void _openDigitalIdCardModal() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => DigitalIdCardScreen(
          user: widget.user,
          hrData: _hrData,
          onRequestPhysicalCard: () => _showHrTicketModal(
            initialCategory: 'ID_CARD',
            initialSubject: 'Physical Staff ID Card Request (${widget.user.employeeNumber})',
          ),
        ),
      ),
    );
  }

  Widget _buildVisualIdCard(Color accent, {bool closeOnRequest = false, BuildContext? modalCtx}) {
    final profile = (_hrData['profile'] as Map<String, dynamic>?) ?? {};
    final idCard = (_hrData['idCard'] as Map<String, dynamic>?) ?? {};
    final cardNumber = idCard['cardNumber']?.toString() ?? widget.user.employeeNumber;
    final status = idCard['status']?.toString() ?? 'DIGITAL_ACTIVE';
    final isRegistryIssued = idCard['isIssuedInRegistry'] == true;
    final hasPendingPhysical = idCard['hasPendingPhysicalRequest'] == true;
    final pendingRef = idCard['pendingRequestCode']?.toString();
    final qrDataUrl = idCard['qrDataUrl']?.toString();

    Uint8List? qrBytes;
    if (qrDataUrl != null && qrDataUrl.contains(',')) {
      try {
        qrBytes = base64Decode(qrDataUrl.split(',').last);
      } catch (_) {}
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(22),
            gradient: LinearGradient(
              colors: [const Color(0xFF0F172A), Color.lerp(const Color(0xFF0F172A), accent, 0.35)!],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFF0F172A).withOpacity(0.22),
                blurRadius: 18,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: Column(
            children: [
              // Card Top Header Strip
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
                decoration: BoxDecoration(
                  color: accent,
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        const SubsidiaryLogoBadge(size: 32, borderRadius: 9),
                        const SizedBox(width: 10),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              (profile['subsidiaryName']?.toString() ?? 'BEMS GROUP').toUpperCase(),
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 12.5,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 0.6,
                              ),
                            ),
                            const Text(
                              'OFFICIAL STAFF CREDENTIAL',
                              style: TextStyle(color: Colors.white70, fontSize: 9.5, fontWeight: FontWeight.w700),
                            ),
                          ],
                        ),
                      ],
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.2),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        status == 'ACTIVE' ? 'ISSUED' : 'DIGITAL ACTIVE',
                        style: const TextStyle(color: Colors.white, fontSize: 9.5, fontWeight: FontWeight.w900),
                      ),
                    ),
                  ],
                ),
              ),
              // Card Body
              Padding(
                padding: const EdgeInsets.all(18),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              StaffAvatar(
                                avatarUrl: profile['avatarUrl']?.toString() ?? widget.user.avatarUrl,
                                fullName: profile['legalName']?.toString() ?? widget.user.fullName,
                                radius: 26,
                                borderRadius: 14,
                                accentColor: accent,
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      profile['legalName']?.toString() ?? widget.user.fullName,
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 16,
                                        fontWeight: FontWeight.w900,
                                      ),
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      profile['jobTitle']?.toString() ?? 'Staff Member',
                                      style: const TextStyle(color: Color(0xFFCBD5E1), fontSize: 12, fontWeight: FontWeight.w600),
                                    ),
                                    Text(
                                      profile['departmentName']?.toString() ?? 'Operations',
                                      style: TextStyle(color: accent, fontSize: 11, fontWeight: FontWeight.w800),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 16),
                          Wrap(
                            spacing: 16,
                            runSpacing: 8,
                            children: [
                              _idMeta('CARD NO', cardNumber),
                              _idMeta('STAFF ID', profile['employeeNumber']?.toString() ?? widget.user.employeeNumber),
                              _idMeta('ISSUED', _fmtShortDate(idCard['issuedAt'])),
                              if (idCard['expiresAt'] != null)
                                _idMeta('EXPIRES', _fmtShortDate(idCard['expiresAt'])),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 14),
                    // Scannable QR Badge
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: qrBytes != null
                          ? Image.memory(qrBytes, width: 88, height: 88, fit: BoxFit.contain)
                          : const SizedBox(
                              width: 88,
                              height: 88,
                              child: Icon(Icons.qr_code_2_rounded, size: 72, color: Color(0xFF0F172A)),
                            ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        // Physical ID Card Request Action & Workflow Status
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: const Color(0xFFE2E8F0)),
          ),
          child: Row(
            children: [
              Icon(
                hasPendingPhysical
                    ? Icons.hourglass_top_rounded
                    : isRegistryIssued
                        ? Icons.verified_user_rounded
                        : Icons.credit_card_rounded,
                size: 18,
                color: hasPendingPhysical ? const Color(0xFFD97706) : accent,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      hasPendingPhysical
                          ? 'Physical ID Request In Queue ($pendingRef)'
                          : isRegistryIssued
                              ? 'Physical Card Registered in HR System'
                              : 'Need a Printed Physical Staff ID Card?',
                      style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: Color(0xFF0F172A)),
                    ),
                    Text(
                      hasPendingPhysical
                          ? 'HR is processing your physical badge. You will be notified when ready for pickup.'
                          : 'Requests go directly to the HR Requests & ID Card Issuance queue.',
                      style: const TextStyle(fontSize: 11, color: Color(0xFF64748B)),
                    ),
                  ],
                ),
              ),
              if (!hasPendingPhysical)
                TextButton(
                  onPressed: () {
                    if (closeOnRequest && modalCtx != null) Navigator.pop(modalCtx);
                    _showHrTicketModal(
                      initialCategory: 'ID_CARD',
                      initialSubject: 'Physical Staff ID Card Request (${widget.user.employeeNumber})',
                    );
                  },
                  child: Text(
                    isRegistryIssued ? 'Reprint' : 'Request Card',
                    style: TextStyle(fontWeight: FontWeight.w800, color: accent),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _idMeta(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 9, fontWeight: FontWeight.w800, letterSpacing: 0.6),
        ),
        const SizedBox(height: 2),
        Text(
          value,
          style: const TextStyle(color: Colors.white, fontSize: 11.5, fontWeight: FontWeight.w800),
        ),
      ],
    );
  }

  Future<void> _openQuickCreateSheet() async {
    final accent = SubsidiaryTheme.current.color;
    final today = _hrData['todayAttendance'] as Map<String, dynamic>?;
    await showModalBottomSheet(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 36,
                  height: 4,
                  decoration: BoxDecoration(color: const Color(0xFFE2E8F0), borderRadius: BorderRadius.circular(2)),
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                'HR Quick Actions',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: Color(0xFF0F172A)),
              ),
              const SizedBox(height: 12),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: CircleAvatar(
                  backgroundColor: accent.withOpacity(0.12),
                  child: Icon(Icons.event_available_rounded, color: accent, size: 20),
                ),
                title: const Text('Request Leave', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
                subtitle: const Text('Pick dates for annual, sick or casual leave', style: TextStyle(fontSize: 12)),
                onTap: () {
                  Navigator.pop(ctx);
                  _showLeaveModal();
                },
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const CircleAvatar(
                  backgroundColor: Color(0xFFEEF2FF),
                  child: Icon(Icons.support_agent_rounded, color: Color(0xFF4F46E5), size: 20),
                ),
                title: const Text('Submit HR Ticket / ID Request', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
                subtitle: const Text('Physical ID card, employment letter or payroll query', style: TextStyle(fontSize: 12)),
                onTap: () {
                  Navigator.pop(ctx);
                  _showHrTicketModal();
                },
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const CircleAvatar(
                  backgroundColor: Color(0xFFECFDF5),
                  child: Icon(Icons.qr_code_scanner_rounded, color: Color(0xFF059669), size: 20),
                ),
                title: Text(
                  today == null ? 'Clock In Now' : 'Clock Out Now',
                  style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14),
                ),
                subtitle: const Text('QR & geofenced attendance verification', style: TextStyle(fontSize: 12)),
                onTap: () {
                  Navigator.pop(ctx);
                  _openAttendanceScanner(isCheckIn: today == null);
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _showLeaveModal() async {
    String leaveType = 'ANNUAL';
    DateTime startDt = DateTime.now().add(const Duration(days: 1));
    DateTime endDt = DateTime.now().add(const Duration(days: 2));
    final reasonCtrl = TextEditingController();
    final handoverCtrl = TextEditingController();
    bool submitting = false;

    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) {
          final days = endDt.difference(startDt).inDays + 1;
          return Padding(
            padding: EdgeInsets.only(
              left: 20,
              right: 20,
              top: 20,
              bottom: MediaQuery.of(ctx).viewInsets.bottom + 24,
            ),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'Request Leave',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Color(0xFF0F172A)),
                  ),
                  const SizedBox(height: 14),
                  DropdownButtonFormField<String>(
                    value: leaveType,
                    decoration: InputDecoration(
                      labelText: 'Leave Type',
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    items: const [
                      DropdownMenuItem(value: 'ANNUAL', child: Text('Annual Leave')),
                      DropdownMenuItem(value: 'SICK', child: Text('Sick Leave')),
                      DropdownMenuItem(value: 'CASUAL', child: Text('Casual Leave')),
                      DropdownMenuItem(value: 'MATERNITY', child: Text('Maternity Leave')),
                      DropdownMenuItem(value: 'PATERNITY', child: Text('Paternity Leave')),
                      DropdownMenuItem(value: 'COMPASSIONATE', child: Text('Compassionate Leave')),
                      DropdownMenuItem(value: 'STUDY', child: Text('Study / Exam Leave')),
                      DropdownMenuItem(value: 'EMERGENCY', child: Text('Emergency Leave')),
                      DropdownMenuItem(value: 'UNPAID', child: Text('Unpaid Leave')),
                    ],
                    onChanged: (v) => setModalState(() => leaveType = v ?? 'ANNUAL'),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: InkWell(
                          onTap: () async {
                            final picked = await showDatePicker(
                              context: ctx,
                              initialDate: startDt,
                              firstDate: DateTime.now().subtract(const Duration(days: 7)),
                              lastDate: DateTime.now().add(const Duration(days: 365)),
                            );
                            if (picked != null) {
                              setModalState(() {
                                startDt = picked;
                                if (endDt.isBefore(startDt)) endDt = startDt;
                              });
                            }
                          },
                          child: InputDecorator(
                            decoration: InputDecoration(
                              labelText: 'Start Date',
                              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                            ),
                            child: Text(DateFormat('d MMM yyyy').format(startDt)),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: InkWell(
                          onTap: () async {
                            final picked = await showDatePicker(
                              context: ctx,
                              initialDate: endDt,
                              firstDate: startDt,
                              lastDate: DateTime.now().add(const Duration(days: 365)),
                            );
                            if (picked != null) {
                              setModalState(() => endDt = picked);
                            }
                          },
                          child: InputDecorator(
                            decoration: InputDecoration(
                              labelText: 'End Date',
                              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                            ),
                            child: Text(DateFormat('d MMM yyyy').format(endDt)),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Duration: $days ${days == 1 ? 'day' : 'days'}',
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: SubsidiaryTheme.current.color),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: reasonCtrl,
                    maxLines: 3,
                    decoration: InputDecoration(
                      labelText: 'Reason',
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: handoverCtrl,
                    decoration: InputDecoration(
                      labelText: 'Handover Colleague / Notes (Optional)',
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                  ),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: submitting
                        ? null
                        : () async {
                            if (reasonCtrl.text.trim().isEmpty) return;
                            setModalState(() => submitting = true);
                            try {
                              await StaffApiService.submitLeaveRequest(
                                user: widget.user,
                                leaveType: leaveType,
                                startDate: DateFormat('yyyy-MM-dd').format(startDt),
                                endDate: DateFormat('yyyy-MM-dd').format(endDt),
                                reason: reasonCtrl.text.trim(),
                                handoverNotes: handoverCtrl.text.trim().isEmpty ? null : handoverCtrl.text.trim(),
                              );
                              if (ctx.mounted) Navigator.pop(ctx);
                              await _loadHrData();
                              if (mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(
                                    content: Text('Leave request sent to HR for approval.'),
                                    backgroundColor: Color(0xFF059669),
                                  ),
                                );
                              }
                            } catch (e) {
                              setModalState(() => submitting = false);
                              if (mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(
                                    content: Text(e.toString().replaceFirst('Exception: ', '')),
                                    backgroundColor: const Color(0xFFDC2626),
                                  ),
                                );
                              }
                            }
                          },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: SubsidiaryTheme.current.color,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                    child: Text(
                      submitting ? 'Submitting...' : 'Submit Leave Request',
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Future<void> _showHrTicketModal({String initialCategory = 'EMPLOYMENT_LETTER', String initialSubject = ''}) async {
    String category = initialCategory;
    String priority = 'NORMAL';
    final subjectCtrl = TextEditingController(text: initialSubject);
    final descCtrl = TextEditingController();
    bool submitting = false;

    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) => Padding(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 20,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 24,
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'New HR Request',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Color(0xFF0F172A)),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Routed directly to your subsidiary HR queue with a tracking reference code.',
                  style: TextStyle(fontSize: 12, color: Color(0xFF64748B)),
                ),
                const SizedBox(height: 14),
                DropdownButtonFormField<String>(
                  value: category,
                  decoration: InputDecoration(
                    labelText: 'Request Category',
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  items: const [
                    DropdownMenuItem(value: 'ID_CARD', child: Text('Physical Staff ID Card')),
                    DropdownMenuItem(value: 'EMPLOYMENT_LETTER', child: Text('Employment / Visa Letter')),
                    DropdownMenuItem(value: 'SALARY_ADVANCE', child: Text('Salary Advance / Loan Inquiry')),
                    DropdownMenuItem(value: 'INFO_CORRECTION', child: Text('Profile / Bank Correction')),
                    DropdownMenuItem(value: 'PAYROLL_INQUIRY', child: Text('Payroll / Deduction Inquiry')),
                    DropdownMenuItem(value: 'EQUIPMENT', child: Text('Work Equipment Request')),
                    DropdownMenuItem(value: 'WFH', child: Text('Remote Work Request')),
                    DropdownMenuItem(value: 'SCHEDULE', child: Text('Schedule / Shift Change')),
                    DropdownMenuItem(value: 'TRAINING', child: Text('External Training Request')),
                    DropdownMenuItem(value: 'TRANSFER', child: Text('Department / Branch Transfer')),
                    DropdownMenuItem(value: 'SALARY_REVIEW', child: Text('Salary Review Request')),
                    DropdownMenuItem(value: 'RESIGNATION_EXIT', child: Text('Resignation / Exit Notice')),
                  ],
                  onChanged: (v) => setModalState(() => category = v ?? 'EMPLOYMENT_LETTER'),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  value: priority,
                  decoration: InputDecoration(
                    labelText: 'Priority',
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  items: const [
                    DropdownMenuItem(value: 'LOW', child: Text('Low')),
                    DropdownMenuItem(value: 'NORMAL', child: Text('Normal')),
                    DropdownMenuItem(value: 'HIGH', child: Text('High')),
                    DropdownMenuItem(value: 'URGENT', child: Text('Urgent')),
                  ],
                  onChanged: (v) => setModalState(() => priority = v ?? 'NORMAL'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: subjectCtrl,
                  decoration: InputDecoration(
                    labelText: 'Subject',
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: descCtrl,
                  maxLines: 3,
                  decoration: InputDecoration(
                    labelText: 'Details / Delivery Instructions',
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
                const SizedBox(height: 16),
                ElevatedButton(
                  onPressed: submitting
                      ? null
                      : () async {
                          if (subjectCtrl.text.trim().isEmpty || descCtrl.text.trim().isEmpty) return;
                          setModalState(() => submitting = true);
                          try {
                            final res = await StaffApiService.submitHrRequestTicket(
                              user: widget.user,
                              category: category,
                              subject: subjectCtrl.text.trim(),
                              description: descCtrl.text.trim(),
                              priority: priority,
                            );
                            final refCode = res['ticket']?['referenceCode']?.toString() ?? '';
                            if (ctx.mounted) Navigator.pop(ctx);
                            await _loadHrData();
                            if (mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content: Text('Submitted $refCode to HR queue.'),
                                  backgroundColor: const Color(0xFF059669),
                                ),
                              );
                            }
                          } catch (e) {
                            setModalState(() => submitting = false);
                            if (mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content: Text(e.toString().replaceFirst('Exception: ', '')),
                                  backgroundColor: const Color(0xFFDC2626),
                                ),
                              );
                            }
                          }
                        },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: SubsidiaryTheme.current.color,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                  child: Text(
                    submitting ? 'Submitting...' : 'Submit HR Request',
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _showExcuseModal(String attendanceId, String workDate) async {
    final ctrl = TextEditingController();
    bool submitting = false;
    await showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDlgState) => AlertDialog(
          backgroundColor: Colors.white,
          title: Text('Appeal Attendance ($workDate)', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
          content: TextField(
            controller: ctrl,
            maxLines: 3,
            decoration: const InputDecoration(
              labelText: 'Excuse / Official Duty Reason',
              border: OutlineInputBorder(),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
            ElevatedButton(
              onPressed: submitting
                  ? null
                  : () async {
                      if (ctrl.text.trim().isEmpty) return;
                      setDlgState(() => submitting = true);
                      try {
                        await StaffApiService.requestAttendanceExcuse(
                          user: widget.user,
                          attendanceId: attendanceId,
                          excuseReason: ctrl.text.trim(),
                        );
                        if (ctx.mounted) Navigator.pop(ctx);
                        await _loadHrData();
                      } catch (e) {
                        setDlgState(() => submitting = false);
                      }
                    },
              style: ElevatedButton.styleFrom(backgroundColor: SubsidiaryTheme.current.color, foregroundColor: Colors.white),
              child: Text(submitting ? 'Sending...' : 'Submit Appeal'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _showDisputeModal(String adjustmentId, String title) async {
    final ctrl = TextEditingController();
    bool submitting = false;
    await showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDlgState) => AlertDialog(
          backgroundColor: Colors.white,
          title: Text('Dispute: $title', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
          content: TextField(
            controller: ctrl,
            maxLines: 3,
            decoration: const InputDecoration(
              labelText: 'Explain why this deduction should be reviewed',
              border: OutlineInputBorder(),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
            ElevatedButton(
              onPressed: submitting
                  ? null
                  : () async {
                      if (ctrl.text.trim().isEmpty) return;
                      setDlgState(() => submitting = true);
                      try {
                        await StaffApiService.disputeDeduction(
                          user: widget.user,
                          adjustmentId: adjustmentId,
                          disputeNote: ctrl.text.trim(),
                        );
                        if (ctx.mounted) Navigator.pop(ctx);
                        await _loadHrData();
                      } catch (e) {
                        setDlgState(() => submitting = false);
                      }
                    },
              style: ElevatedButton.styleFrom(backgroundColor: SubsidiaryTheme.current.color, foregroundColor: Colors.white),
              child: Text(submitting ? 'Sending...' : 'Submit Dispute'),
            ),
          ],
        ),
      ),
    );
  }

  void _showPayslipBreakdown(Map<String, dynamic> p) {
    final currency = p['currency']?.toString() ?? 'NGN';
    final profile = (_hrData['profile'] as Map<String, dynamic>?) ?? {};
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Payslip · ${p['period'] ?? 'Payroll Run'}',
                  style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: Color(0xFF0F172A)),
                ),
                _statusPill(p['batchStatus']?.toString() ?? 'ISSUED'),
              ],
            ),
            const SizedBox(height: 14),
            _profileRow('Employee', profile['legalName']?.toString() ?? widget.user.fullName),
            _profileRow('Gross Earnings', _fmtMinor(p['grossMinor'], currency)),
            _profileRow('Total Deductions', '-${_fmtMinor(p['deductionsMinor'], currency)}'),
            const Divider(),
            _profileRow('Net Take-Home Pay', _fmtMinor(p['netMinor'], currency)),
            _profileRow('Disbursement Bank', '${profile['bankName'] ?? '—'} · ${profile['accountNumber'] ?? ''}'),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final accent = SubsidiaryTheme.current.color;
    final subsidiaryLabel = widget.user.subsidiary.isNotEmpty ? widget.user.subsidiary : 'BEMS Group';

    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        backgroundColor: const Color(0xFFF8FAFC),
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        automaticallyImplyLeading: false,
        titleSpacing: 16,
        title: InkWell(
          onTap: _openProfileModal,
          borderRadius: BorderRadius.circular(12),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                StaffAvatar(
                  avatarUrl: widget.user.avatarUrl,
                  fullName: widget.user.fullName,
                  radius: 20,
                  borderRadius: 12,
                  accentColor: accent,
                ),
                const SizedBox(width: 10),
                Flexible(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Flexible(
                            child: Text(
                              widget.user.fullName,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 14.5,
                                fontWeight: FontWeight.w900,
                                color: Color(0xFF0F172A),
                                letterSpacing: -0.2,
                              ),
                            ),
                          ),
                          const SizedBox(width: 4),
                          Icon(Icons.verified_rounded, size: 14, color: accent),
                        ],
                      ),
                      const SizedBox(height: 1),
                      Text(
                        '${widget.user.employeeNumber} · $subsidiaryLabel · Tap for Profile',
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 10.5,
                          color: Color(0xFF64748B),
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        actions: [
          InkWell(
            onTap: _openDigitalIdCardModal,
            borderRadius: BorderRadius.circular(12),
            child: Container(
              height: 38,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              decoration: BoxDecoration(
                color: const Color(0xFF0F172A),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.badge_outlined, size: 17, color: Colors.white),
                  SizedBox(width: 6),
                  Text('Staff ID', style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w800)),
                ],
              ),
            ),
          ),
          const SizedBox(width: 8),
          InkWell(
            onTap: () => Navigator.pop(context),
            borderRadius: BorderRadius.circular(12),
            child: Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: accent.withOpacity(0.08),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: accent.withOpacity(0.2)),
              ),
              child: Icon(Icons.grid_view_rounded, size: 19, color: accent),
            ),
          ),
          const SizedBox(width: 8),
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFFE2E8F0)),
            ),
            child: IconButton(
              padding: EdgeInsets.zero,
              icon: const Icon(Icons.refresh_rounded, size: 20, color: Color(0xFF0F172A)),
              tooltip: 'Refresh HR Workspace',
              onPressed: _loadHrData,
            ),
          ),
          const SizedBox(width: 16),
        ],
      ),
      body: SafeArea(
        child: _loading
            ? Center(child: CircularProgressIndicator(color: accent, strokeWidth: 2.5))
            : _error != null
                ? _buildErrorState()
                : PageView(
                    controller: _pageController,
                    physics: const BouncingScrollPhysics(),
                    onPageChanged: (idx) => setState(() => _currentIndex = idx),
                    children: [
                      _buildHomeTab(accent, subsidiaryLabel),
                      _buildAttendanceTab(accent),
                      _buildLeaveTab(accent),
                      _buildDocsAndPayTab(accent),
                    ],
                  ),
      ),
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          boxShadow: [
            BoxShadow(color: Colors.black.withOpacity(0.06), blurRadius: 20, offset: const Offset(0, -4)),
          ],
        ),
        child: BottomNavigationBar(
          currentIndex: _currentIndex >= 2 ? _currentIndex + 1 : _currentIndex,
          onTap: (idx) {
            if (idx == 2) {
              _openQuickCreateSheet();
            } else {
              _navigateToTab(idx > 2 ? idx - 1 : idx);
            }
          },
          backgroundColor: Colors.white,
          selectedItemColor: accent,
          unselectedItemColor: const Color(0xFF94A3B8),
          selectedLabelStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 11),
          unselectedLabelStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 11),
          type: BottomNavigationBarType.fixed,
          elevation: 0,
          items: [
            const BottomNavigationBarItem(icon: Icon(Icons.home_outlined), activeIcon: Icon(Icons.home_rounded), label: 'Home'),
            const BottomNavigationBarItem(icon: Icon(Icons.fingerprint_outlined), activeIcon: Icon(Icons.fingerprint_rounded), label: 'Attendance'),
            BottomNavigationBarItem(
              icon: Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  gradient: LinearGradient(colors: [accent, const Color(0xFFFB923C)]),
                  shape: BoxShape.circle,
                  boxShadow: [BoxShadow(color: accent.withOpacity(0.35), blurRadius: 10, offset: const Offset(0, 4))],
                ),
                child: const Icon(Icons.add_rounded, color: Colors.white, size: 24),
              ),
              label: '',
            ),
            const BottomNavigationBarItem(icon: Icon(Icons.event_available_outlined), activeIcon: Icon(Icons.event_available_rounded), label: 'Leave'),
            const BottomNavigationBarItem(icon: Icon(Icons.apps_outlined), activeIcon: Icon(Icons.apps_rounded), label: 'HR Menu'),
          ],
        ),
      ),
    );
  }

  Widget _buildErrorState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline_rounded, size: 42, color: Color(0xFFDC2626)),
            const SizedBox(height: 12),
            Text(_error ?? 'Could not load HR workspace.', textAlign: TextAlign.center),
            const SizedBox(height: 12),
            ElevatedButton(
              onPressed: _loadHrData,
              style: ElevatedButton.styleFrom(backgroundColor: SubsidiaryTheme.current.color, foregroundColor: Colors.white),
              child: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHomeTab(Color accent, String subsidiaryLabel) {
    final today = _hrData['todayAttendance'] as Map<String, dynamic>?;
    final summary = (_hrData['leaveSummary'] as Map<String, dynamic>?) ?? {};
    final monthPay = (_hrData['currentMonthPay'] as Map<String, dynamic>?) ?? {};
    final currency = monthPay['currency']?.toString() ?? 'NGN';
    final remainingPay = _fmtMinor(monthPay['remainingToCollectMinor'], currency);
    final totalDeductions = _fmtMinor(monthPay['totalDeductionsMinor'], currency);
    final docs = (_hrData['documents'] as List?) ?? [];
    final tickets = (_hrData['hrTickets'] as List?) ?? [];
    final remainingLeave = summary['remainingDays'] ?? 20;

    return RefreshIndicator(
      onRefresh: _loadHrData,
      color: accent,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 30),
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [accent, Color.lerp(accent, const Color(0xFF9A3412), 0.45)!],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(24),
              boxShadow: [BoxShadow(color: accent.withOpacity(0.28), blurRadius: 20, offset: const Offset(0, 10))],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      '${subsidiaryLabel.toUpperCase()} · ${monthPay['monthLabel'] ?? 'THIS MONTH'}',
                      style: TextStyle(color: Colors.white.withOpacity(0.9), fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.7),
                    ),
                    InkWell(
                      onTap: _openDigitalIdCardModal,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(color: Colors.white.withOpacity(0.18), borderRadius: BorderRadius.circular(999)),
                        child: const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.qr_code_2_rounded, size: 14, color: Colors.white),
                            SizedBox(width: 4),
                            Text('Staff ID', style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800)),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                Text(
                  remainingPay,
                  style: const TextStyle(color: Colors.white, fontSize: 30, fontWeight: FontWeight.w900, letterSpacing: -0.6),
                ),
                const SizedBox(height: 4),
                Text(
                  'Remaining to collect this month · Deductions: $totalDeductions',
                  style: TextStyle(color: Colors.white.withOpacity(0.92), fontSize: 12.5, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 10),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(color: Colors.white.withOpacity(0.18), borderRadius: BorderRadius.circular(999)),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.circle, size: 7, color: Color(0xFF86EFAC)),
                      const SizedBox(width: 6),
                      Text(
                        today != null
                            ? 'Clocked in at ${_fmtTimeWat(today['checkInTime'])} WAT · ${today['status'] ?? 'PRESENT'}'
                            : 'Not clocked in today · $remainingLeave leave days left',
                        style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 18),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: () => _openAttendanceScanner(isCheckIn: today == null),
                    icon: Icon(today == null ? Icons.qr_code_scanner_rounded : Icons.logout_rounded, size: 18),
                    label: Text(
                      today == null ? 'Clock In for Shift' : 'Clock Out for Shift',
                      style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: accent,
                      elevation: 0,
                      padding: const EdgeInsets.symmetric(vertical: 13),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
                    ),
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 16),

          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: const Color(0xFFE2E8F0)),
            ),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFF7ED),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFFFED7AA)),
                  ),
                  child: Icon(Icons.receipt_long_outlined, color: accent, size: 22),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Pay Breakdown, Contracts & HR Desk',
                        style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: Color(0xFF0F172A)),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '${docs.length} Contracts/Docs · ${tickets.length} HR Tickets · Gross ${_fmtMinor(monthPay['grossMonthlyMinor'], currency)}',
                        style: const TextStyle(fontSize: 11, color: Color(0xFF64748B), fontWeight: FontWeight.w500),
                      ),
                    ],
                  ),
                ),
                ElevatedButton(
                  onPressed: () => _navigateToTab(3),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFF8FAFC),
                    foregroundColor: const Color(0xFF0F172A),
                    elevation: 0,
                    side: const BorderSide(color: Color(0xFFE2E8F0)),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  child: const Text('Open', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800)),
                ),
              ],
            ),
          ),

          const SizedBox(height: 18),
          Row(
            children: [
              Expanded(child: _miniStat("Today's Attendance", today != null ? (today['status']?.toString() ?? 'PRESENT') : 'NOT IN', accent)),
              const SizedBox(width: 10),
              Expanded(child: _miniStat('Leave Balance', '$remainingLeave days', const Color(0xFF059669))),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(child: _miniStat('Pending Requests', '${tickets.where((t) => t['status'] == 'PENDING').length}', const Color(0xFFD97706))),
              const SizedBox(width: 10),
              Expanded(child: _miniStat('Active KPIs', '${((_hrData['performance'] as Map?)?['kpis'] as List? ?? []).length}', const Color(0xFF0284C7))),
            ],
          ),

          const SizedBox(height: 22),
          const Text('HR Services & Quick Access', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: Color(0xFF0F172A))),
          const SizedBox(height: 12),

          LayoutBuilder(
            builder: (context, constraints) {
              final cols = constraints.maxWidth >= 900 ? 4 : 2;
              final items = <Widget>[
                _quickAccessCard(Icons.person_outline_rounded, 'My Profile', 'Dossier & Bank', accent, _openProfileModal),
                _quickAccessCard(Icons.badge_rounded, 'Digital Staff ID', 'Front & Back QR', const Color(0xFF0F172A), _openDigitalIdCardModal),
                _quickAccessCard(Icons.access_time_rounded, 'Attendance', 'Clock-In & Log', const Color(0xFF059669), () => _navigateToTab(1)),
                _quickAccessCard(Icons.event_note_rounded, 'My Schedule', 'Shifts & Grace', const Color(0xFF0284C7), () => Navigator.push(context, MaterialPageRoute(builder: (_) => HrScheduleScreen(hrData: _hrData)))),
                _quickAccessCard(Icons.event_available_rounded, 'Leave', '$remainingLeave Days Left', accent, () => _navigateToTab(2)),
                _quickAccessCard(Icons.account_balance_wallet_rounded, 'Salary & Payslips', 'Pay & Balance', accent, () => Navigator.push(context, MaterialPageRoute(builder: (_) => HrSalaryPayslipsScreen(hrData: _hrData, onTapPayslip: _showPayslipBreakdown)))),
                _quickAccessCard(Icons.receipt_long_rounded, 'Deductions', 'Itemized & Disputes', const Color(0xFFDC2626), () => Navigator.push(context, MaterialPageRoute(builder: (_) => HrDeductionsScreen(user: widget.user, hrData: _hrData, onDispute: _showDisputeModal)))),
                _quickAccessCard(Icons.assignment_rounded, 'My Requests', 'Letters & Approvals', const Color(0xFF0284C7), () => Navigator.push(context, MaterialPageRoute(builder: (_) => HrRequestsScreen(user: widget.user, hrData: _hrData, onRefresh: _loadHrData, onNewRequest: _showHrTicketModal)))),
                _quickAccessCard(Icons.track_changes_rounded, 'Performance', 'KPIs & Probation', const Color(0xFF059669), () => Navigator.push(context, MaterialPageRoute(builder: (_) => HrPerformanceScreen(user: widget.user, hrData: _hrData, onRefresh: _loadHrData)))),
                _quickAccessCard(Icons.folder_shared_rounded, 'Documents', 'Contracts & Sign', const Color(0xFF334155), () => Navigator.push(context, MaterialPageRoute(builder: (_) => HrDocumentsScreen(user: widget.user, hrData: _hrData, onRefresh: _loadHrData, onOpenUrl: _openDocumentUrl)))),
                _quickAccessCard(Icons.school_rounded, 'Learning & Career', 'Training & Timeline', const Color(0xFF7C3AED), () => Navigator.push(context, MaterialPageRoute(builder: (_) => HrWorkspaceDirectoryScreen(user: widget.user, hrData: _hrData, onRefresh: _loadHrData, onOpenTicket: _showHrTicketModal)))),
                _quickAccessCard(Icons.volunteer_activism_rounded, 'Benefits & Loans', 'Advances & Welfare', const Color(0xFF0284C7), () => Navigator.push(context, MaterialPageRoute(builder: (_) => HrBenefitsScreen(hrData: _hrData, onOpenLoans: () => Navigator.push(context, MaterialPageRoute(builder: (_) => HrLoansScreen(user: widget.user, hrData: _hrData, onRefresh: _loadHrData))))))),
                _quickAccessCard(Icons.gavel_rounded, 'HR Cases', 'Queries & Grievances', const Color(0xFFDC2626), () => Navigator.push(context, MaterialPageRoute(builder: (_) => HrCasesScreen(user: widget.user, hrData: _hrData, onRefresh: _loadHrData)))),
                _quickAccessCard(Icons.campaign_rounded, 'Policies & Notices', 'Updates & Sign-Off', const Color(0xFF7C3AED), () => Navigator.push(context, MaterialPageRoute(builder: (_) => HrWorkspaceDirectoryScreen(user: widget.user, hrData: _hrData, onRefresh: _loadHrData, onOpenTicket: _showHrTicketModal)))),
                _quickAccessCard(Icons.exit_to_app_rounded, 'Exit & Clearance', 'Handover & Exit', const Color(0xFF64748B), () => Navigator.push(context, MaterialPageRoute(builder: (_) => HrWorkspaceDirectoryScreen(user: widget.user, hrData: _hrData, onRefresh: _loadHrData, onOpenTicket: _showHrTicketModal)))),
                _quickAccessCard(Icons.support_agent_rounded, 'HR Helpdesk', 'Confidential Support', const Color(0xFF0F172A), () => _showHrTicketModal()),
              ];
              return GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: cols,
                  mainAxisSpacing: 10,
                  crossAxisSpacing: 10,
                  mainAxisExtent: 76,
                ),
                itemCount: items.length,
                itemBuilder: (_, idx) => items[idx],
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildActionTile({
    required String title,
    required String subtitle,
    required IconData icon,
    required Color iconColor,
    required Color iconBgColor,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(18),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: const Color(0xFFE2E8F0)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(color: iconBgColor, borderRadius: BorderRadius.circular(10)),
              child: Icon(icon, color: iconColor, size: 20),
            ),
            const SizedBox(height: 14),
            Text(title, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: Color(0xFF0F172A))),
            const SizedBox(height: 2),
            Text(subtitle, style: const TextStyle(fontSize: 11, color: Color(0xFF64748B), fontWeight: FontWeight.w500)),
          ],
        ),
      ),
    );
  }

  Widget _buildAttendanceTab(Color accent) {
    final today = _hrData['todayAttendance'] as Map<String, dynamic>?;
    final schedule = (_hrData['schedule'] as Map<String, dynamic>?) ?? {};
    final records = (_hrData['attendanceRecords'] as List?) ?? [];
    final presentCount = records.where((r) => r['status'] == 'PRESENT').length;
    final lateCount = records.where((r) => r['status'] == 'LATE' || r['status'] == 'ABSENT').length;
    final totalAttDeductions = records.fold<num>(0, (s, r) => s + ((r['deductionMinor'] as num?) ?? 0));

    return RefreshIndicator(
      onRefresh: _loadHrData,
      color: accent,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 30),
        children: [
          Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFFE2E8F0)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Assigned Shift: ${schedule['shiftStart'] ?? '08:00'} – ${schedule['shiftEnd'] ?? '17:00'}',
                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: Color(0xFF0F172A)),
                ),
                Text(
                  'Grace: ${schedule['gracePeriodMinutes'] ?? 15}m',
                  style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: accent),
                ),
              ],
            ),
          ),
          Row(
            children: [
              Expanded(child: _miniStat('Present', '$presentCount days', const Color(0xFF059669))),
              const SizedBox(width: 10),
              Expanded(child: _miniStat('Late / Absent', '$lateCount days', const Color(0xFFD97706))),
              const SizedBox(width: 10),
              Expanded(child: _miniStat('Deductions', _fmtMinor(totalAttDeductions), const Color(0xFFDC2626))),
            ],
          ),
          const SizedBox(height: 14),
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
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      _fmtWorkDate(_hrData['todayDate']),
                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFF64748B)),
                    ),
                    _statusPill(today?['status']?.toString() ?? 'NOT CLOCKED IN'),
                  ],
                ),
                const SizedBox(height: 10),
                Text(
                  today != null
                      ? 'Clocked in at ${_fmtTimeWat(today['checkInTime'])} WAT'
                      : 'You have not clocked in today.',
                  style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w800, color: Color(0xFF0F172A)),
                ),
                const SizedBox(height: 14),
                Wrap(
                  spacing: 10,
                  runSpacing: 8,
                  children: [
                    ElevatedButton.icon(
                      onPressed: () => _openAttendanceScanner(isCheckIn: today == null),
                      icon: const Icon(Icons.qr_code_scanner_rounded, size: 17),
                      label: Text(today == null ? 'Clock In' : 'Clock Out', style: const TextStyle(fontWeight: FontWeight.w800)),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: accent,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                    ),
                    OutlinedButton.icon(
                      onPressed: () => Navigator.push(
                        context,
                        MaterialPageRoute(builder: (_) => AttendanceMonthlyScreen(currentUser: widget.user)),
                      ),
                      icon: const Icon(Icons.calendar_month_rounded, size: 17),
                      label: const Text('Monthly Calendar', style: TextStyle(fontWeight: FontWeight.w700)),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: const Color(0xFF0F172A),
                        side: const BorderSide(color: Color(0xFFE2E8F0)),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          _buildSolidAttendanceCalendar(accent, schedule, records),
          const SizedBox(height: 18),
          const Text('Recent Attendance Log', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: Color(0xFF0F172A))),
          const SizedBox(height: 10),
          if (records.isEmpty)
            _emptyCard('No attendance records yet.')
          else
            ...records.map((r) {
              final status = r['status']?.toString() ?? 'PRESENT';
              final ded = (r['deductionMinor'] as num?) ?? 0;
              final excuseStatus = r['excuseStatus']?.toString() ?? 'NONE';
              final canAppeal = (status == 'LATE' || status == 'ABSENT' || ded > 0) && excuseStatus == 'NONE';
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
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                _fmtWorkDate(r['workDate']),
                                style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: Color(0xFF0F172A)),
                              ),
                              const SizedBox(height: 3),
                              Text(
                                'In: ${_fmtTimeWat(r['checkInTime'])} · Out: ${_fmtTimeWat(r['checkOutTime'])}',
                                style: const TextStyle(fontSize: 12, color: Color(0xFF64748B)),
                              ),
                            ],
                          ),
                        ),
                        _statusPill(status),
                      ],
                    ),
                    if (ded > 0 || excuseStatus != 'NONE') ...[
                      const SizedBox(height: 8),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            ded > 0 ? 'Deduction: ${_fmtMinor(ded)}' : 'Excuse: $excuseStatus',
                            style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: Color(0xFFDC2626)),
                          ),
                          if (canAppeal)
                            TextButton(
                              onPressed: () => _showExcuseModal(r['id'].toString(), r['workDate'].toString()),
                              child: const Text('Appeal / Submit Excuse', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800)),
                            ),
                        ],
                      ),
                    ],
                  ],
                ),
              );
            }),
        ],
      ),
    );
  }

  Widget _buildSolidAttendanceCalendar(
    Color accent,
    Map<String, dynamic> schedule,
    List<dynamic> records,
  ) {
    final recordMap = <String, Map<String, dynamic>>{};
    for (final r in records) {
      if (r is Map<String, dynamic> && r['workDate'] != null) {
        recordMap[r['workDate'].toString()] = r;
      }
    }

    final offDaysSet = (schedule['weeklyOffDays']?.toString() ?? '0,6')
        .split(',')
        .map((e) => int.tryParse(e.trim()))
        .whereType<int>()
        .toSet();

    final leaveRequests = (_hrData['leaveRequests'] as List?) ?? [];
    final approvedLeaveDates = <String>{};
    for (final l in leaveRequests) {
      if (l is Map && l['status'] == 'APPROVED') {
        final s = DateTime.tryParse(l['startDate']?.toString() ?? '');
        final e = DateTime.tryParse(l['endDate']?.toString() ?? '');
        if (s != null && e != null) {
          for (var d = s; !d.isAfter(e); d = d.add(const Duration(days: 1))) {
            approvedLeaveDates.add(DateFormat('yyyy-MM-dd').format(d));
          }
        }
      }
    }

    final firstDay = DateTime(_calendarMonth.year, _calendarMonth.month, 1);
    final daysInMonth = DateTime(_calendarMonth.year, _calendarMonth.month + 1, 0).day;
    final leadingBlanks = (firstDay.weekday - 1) % 7; // Mon = 0 .. Sun = 6
    final todayKey = _hrData['todayDate']?.toString() ?? DateFormat('yyyy-MM-dd').format(DateTime.now());
    final activeDateKey = _selectedDateKey ?? todayKey;
    final selectedRec = recordMap[activeDateKey];

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                DateFormat('MMMM yyyy').format(_calendarMonth),
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: Color(0xFF0F172A)),
              ),
              Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.chevron_left_rounded),
                    onPressed: () => setState(() {
                      _calendarMonth = DateTime(_calendarMonth.year, _calendarMonth.month - 1, 1);
                    }),
                  ),
                  IconButton(
                    icon: const Icon(Icons.chevron_right_rounded),
                    onPressed: () => setState(() {
                      _calendarMonth = DateTime(_calendarMonth.year, _calendarMonth.month + 1, 1);
                    }),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
                .map((d) => Expanded(
                      child: Center(
                        child: Text(d, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Color(0xFF64748B))),
                      ),
                    ))
                .toList(),
          ),
          const SizedBox(height: 8),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 7,
              mainAxisSpacing: 6,
              crossAxisSpacing: 6,
              childAspectRatio: 1.05,
            ),
            itemCount: leadingBlanks + daysInMonth,
            itemBuilder: (context, idx) {
              if (idx < leadingBlanks) return const SizedBox.shrink();
              final day = idx - leadingBlanks + 1;
              final dt = DateTime(_calendarMonth.year, _calendarMonth.month, day);
              final key = DateFormat('yyyy-MM-dd').format(dt);
              final rec = recordMap[key];
              final status = rec?['status']?.toString();
              final weekdaySunZero = dt.weekday % 7;
              final isOff = offDaysSet.contains(weekdaySunZero);
              final isLeave = approvedLeaveDates.contains(key);
              final isToday = key == todayKey;
              final isSelected = key == activeDateKey;

              Color bg = const Color(0xFFF8FAFC);
              Color fg = const Color(0xFF0F172A);
              Color? dot;

              if (status == 'PRESENT') {
                bg = const Color(0xFFECFDF5);
                fg = const Color(0xFF065F46);
                dot = const Color(0xFF059669);
              } else if (status == 'LATE') {
                bg = const Color(0xFFFFFBEB);
                fg = const Color(0xFF92400E);
                dot = const Color(0xFFD97706);
              } else if (status == 'ABSENT') {
                bg = const Color(0xFFFEF2F2);
                fg = const Color(0xFF991B1B);
                dot = const Color(0xFFDC2626);
              } else if (isLeave) {
                bg = const Color(0xFFEFF6FF);
                fg = const Color(0xFF1E40AF);
                dot = const Color(0xFF2563EB);
              } else if (isOff) {
                bg = const Color(0xFFF1F5F9);
                fg = const Color(0xFF94A3B8);
              }

              return InkWell(
                onTap: () => setState(() => _selectedDateKey = key),
                borderRadius: BorderRadius.circular(12),
                child: Container(
                  decoration: BoxDecoration(
                    color: bg,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: isSelected
                          ? accent
                          : isToday
                              ? accent.withOpacity(0.5)
                              : const Color(0xFFE2E8F0),
                      width: isSelected ? 2 : 1,
                    ),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text('$day', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: fg)),
                      if (dot != null) ...[
                        const SizedBox(height: 3),
                        Container(width: 5, height: 5, decoration: BoxDecoration(color: dot, shape: BoxShape.circle)),
                      ],
                    ],
                  ),
                ),
              );
            },
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 14,
            runSpacing: 6,
            children: [
              _legendDot(const Color(0xFF059669), 'Present'),
              _legendDot(const Color(0xFFD97706), 'Late'),
              _legendDot(const Color(0xFFDC2626), 'Absent'),
              _legendDot(const Color(0xFF2563EB), 'Leave'),
              _legendDot(const Color(0xFF94A3B8), 'Off Day'),
            ],
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: const Color(0xFFF8FAFC),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFFE2E8F0)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(_fmtWorkDate(activeDateKey), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w900)),
                      const SizedBox(height: 2),
                      Text(
                        selectedRec != null
                            ? 'In: ${_fmtTimeWat(selectedRec['checkInTime'])} · Out: ${_fmtTimeWat(selectedRec['checkOutTime'])}'
                            : approvedLeaveDates.contains(activeDateKey)
                                ? 'Approved Leave Day'
                                : 'No attendance punch recorded for this date.',
                        style: const TextStyle(fontSize: 12, color: Color(0xFF64748B)),
                      ),
                    ],
                  ),
                ),
                if (selectedRec != null) _statusPill(selectedRec['status']?.toString() ?? 'PRESENT'),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _legendDot(Color color, String label) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(width: 8, height: 8, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
          const SizedBox(width: 5),
          Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF64748B))),
        ],
      );

  Widget _miniStat(String label, String value, Color color) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: Color(0xFF64748B))),
          const SizedBox(height: 4),
          Text(value, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w900, color: color)),
        ],
      ),
    );
  }

  Widget _buildLeaveTab(Color accent) {
    final summary = (_hrData['leaveSummary'] as Map<String, dynamic>?) ?? {};
    final requests = (_hrData['leaveRequests'] as List?) ?? [];
    return RefreshIndicator(
      onRefresh: _loadHrData,
      color: accent,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 30),
        children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: const Color(0xFFE2E8F0)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Annual Leave Balance', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFF64748B))),
                    const SizedBox(height: 4),
                    Text('${summary['remainingDays'] ?? 20} Days Remaining', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Color(0xFF0F172A))),
                    Text('Used: ${summary['usedDays'] ?? 0} · Pending: ${summary['pendingCount'] ?? 0}', style: const TextStyle(fontSize: 11.5, color: Color(0xFF64748B))),
                  ],
                ),
                ElevatedButton(
                  onPressed: _showLeaveModal,
                  style: ElevatedButton.styleFrom(backgroundColor: accent, foregroundColor: Colors.white, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                  child: const Text('Request', style: TextStyle(fontWeight: FontWeight.w800)),
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          const Text('My Leave Requests', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: Color(0xFF0F172A))),
          const SizedBox(height: 10),
          if (requests.isEmpty)
            _emptyCard('No leave requests submitted yet.')
          else
            ...requests.map((l) {
              final status = l['status']?.toString() ?? 'PENDING';
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
                          child: Text(
                            '${l['leaveType']} · ${_fmtWorkDate(l['startDate'])} → ${_fmtWorkDate(l['endDate'])}',
                            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: Color(0xFF0F172A)),
                          ),
                        ),
                        _statusPill(status),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(l['reason']?.toString() ?? '', style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
                    if (status == 'PENDING') ...[
                      const SizedBox(height: 6),
                      Align(
                        alignment: Alignment.centerRight,
                        child: TextButton(
                          onPressed: () async {
                            await StaffApiService.cancelLeaveRequest(user: widget.user, leaveId: l['id'].toString());
                            await _loadHrData();
                          },
                          child: const Text('Cancel Request', style: TextStyle(color: Color(0xFFDC2626), fontWeight: FontWeight.w700, fontSize: 12)),
                        ),
                      ),
                    ],
                  ],
                ),
              );
            }),
        ],
      ),
    );
  }

  Widget _quickAccessCard(IconData icon, String title, String subtitle, Color color, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFFE2E8F0)),
        ),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
              child: Icon(icon, color: color, size: 19),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: Color(0xFF0F172A)),
                  ),
                  const SizedBox(height: 1),
                  Text(
                    subtitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 10.5, color: Color(0xFF64748B), fontWeight: FontWeight.w500),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDocsAndPayTab(Color accent) {
    return RefreshIndicator(
      onRefresh: _loadHrData,
      color: accent,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 30),
        children: [
          _buildVisualIdCard(accent),
          const SizedBox(height: 18),
          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: const Color(0xFFE2E8F0)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Padding(
                  padding: EdgeInsets.fromLTRB(18, 16, 18, 10),
                  child: Row(
                    children: [
                      Icon(Icons.groups_rounded, size: 20, color: Color(0xFF0F172A)),
                      SizedBox(width: 8),
                      Text('Human Resources', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: Color(0xFF0F172A))),
                    ],
                  ),
                ),
                const Divider(height: 1, color: Color(0xFFE2E8F0)),
                _hrDirItem(Icons.grid_view_rounded, 'Overview', 'Personal HR dashboard', () => _navigateToTab(0)),
                _hrDirItem(Icons.person_outline_rounded, 'My Profile', 'Personal details and employment information', _openProfileModal),
                _hrDirItem(Icons.access_time_rounded, 'Attendance', 'Clock-in, clock-out, attendance records', () => _navigateToTab(1)),
                _hrDirItem(Icons.event_note_rounded, 'My Schedule', 'Work hours, shifts and holidays', () => Navigator.push(context, MaterialPageRoute(builder: (_) => HrScheduleScreen(hrData: _hrData)))),
                _hrDirItem(Icons.calendar_today_rounded, 'Leave', 'Leave balances, requests and history', () => _navigateToTab(2)),
                _hrDirItem(Icons.account_balance_wallet_outlined, 'Salary & Payslips', 'Payroll, payments and remaining balance', () => Navigator.push(context, MaterialPageRoute(builder: (_) => HrSalaryPayslipsScreen(hrData: _hrData, onTapPayslip: _showPayslipBreakdown)))),
                _hrDirItem(Icons.receipt_long_outlined, 'Deductions & Adjustments', 'Itemized deductions and disputes', () => Navigator.push(context, MaterialPageRoute(builder: (_) => HrDeductionsScreen(user: widget.user, hrData: _hrData, onDispute: _showDisputeModal)))),
                _hrDirItem(Icons.assignment_outlined, 'My Requests', 'Requests, disputes and approval progress', () => Navigator.push(context, MaterialPageRoute(builder: (_) => HrRequestsScreen(user: widget.user, hrData: _hrData, onRefresh: _loadHrData, onNewRequest: _showHrTicketModal)))),
                _hrDirItem(Icons.track_changes_rounded, 'Performance', 'KPIs, appraisals and probation', () => Navigator.push(context, MaterialPageRoute(builder: (_) => HrPerformanceScreen(user: widget.user, hrData: _hrData, onRefresh: _loadHrData)))),
                _hrDirItem(Icons.copy_rounded, 'Documents', 'Employment letters, contracts and signed documents', () => Navigator.push(context, MaterialPageRoute(builder: (_) => HrDocumentsScreen(user: widget.user, hrData: _hrData, onRefresh: _loadHrData, onOpenUrl: _openDocumentUrl)))),
                _hrDirItem(Icons.school_outlined, 'Learning & Career', 'Training, skills and career development', () => Navigator.push(context, MaterialPageRoute(builder: (_) => HrWorkspaceDirectoryScreen(user: widget.user, hrData: _hrData, onRefresh: _loadHrData, onOpenTicket: _showHrTicketModal)))),
                _hrDirItem(Icons.volunteer_activism_outlined, 'Benefits & Advances', 'Benefits, welfare, loans and advances', () => Navigator.push(context, MaterialPageRoute(builder: (_) => HrBenefitsScreen(hrData: _hrData, onOpenLoans: () => Navigator.push(context, MaterialPageRoute(builder: (_) => HrLoansScreen(user: widget.user, hrData: _hrData, onRefresh: _loadHrData))))))),
                _hrDirItem(Icons.verified_user_outlined, 'HR Cases', 'Formal notices, responses and grievances', () => Navigator.push(context, MaterialPageRoute(builder: (_) => HrCasesScreen(user: widget.user, hrData: _hrData, onRefresh: _loadHrData)))),
                _hrDirItem(Icons.campaign_outlined, 'Policies & Announcements', 'Company policies and HR updates', () => Navigator.push(context, MaterialPageRoute(builder: (_) => HrWorkspaceDirectoryScreen(user: widget.user, hrData: _hrData, onRefresh: _loadHrData, onOpenTicket: _showHrTicketModal)))),
                _hrDirItem(Icons.exit_to_app_rounded, 'Exit & Clearance', 'Resignation, handover and settlement', () => Navigator.push(context, MaterialPageRoute(builder: (_) => HrWorkspaceDirectoryScreen(user: widget.user, hrData: _hrData, onRefresh: _loadHrData, onOpenTicket: _showHrTicketModal)))),
                _hrDirItem(Icons.headset_mic_outlined, 'HR Helpdesk', 'Confidential HR support and enquiries', () => _showHrTicketModal(), isLast: true),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _hrDirItem(IconData icon, String title, String subtitle, VoidCallback onTap, {bool isLast = false}) {
    return Column(
      children: [
        ListTile(
          onTap: onTap,
          leading: Icon(icon, size: 21, color: const Color(0xFF475569)),
          title: Text(title, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: Color(0xFF0F172A))),
          subtitle: Text(subtitle, style: const TextStyle(fontSize: 11.5, color: Color(0xFF64748B))),
          trailing: const Icon(Icons.chevron_right_rounded, size: 18, color: Color(0xFFCBD5E1)),
        ),
        if (!isLast) const Divider(height: 1, indent: 56, color: Color(0xFFF1F5F9)),
      ],
    );
  }

  Widget _rowCard({required String title, required String subtitle, required String status}) {
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
                Text(title, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: Color(0xFF0F172A))),
                const SizedBox(height: 3),
                Text(subtitle, style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
              ],
            ),
          ),
          const SizedBox(width: 8),
          _statusPill(status),
        ],
      ),
    );
  }

  Widget _emptyCard(String message) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Text(message, style: const TextStyle(fontSize: 13, color: Color(0xFF64748B))),
    );
  }

  Widget _statusPill(String status) {
    final s = status.toUpperCase();
    final isOk = s == 'APPROVED' || s == 'PRESENT' || s == 'DISBURSED' || s == 'PAID' || s == 'RESOLVED' || s == 'SIGNED' || s == 'READY';
    final isBad = s == 'REJECTED' || s == 'ABSENT' || s == 'CANCELLED' || s == 'DISPUTED';
    final color = isOk
        ? const Color(0xFF059669)
        : isBad
            ? const Color(0xFFDC2626)
            : const Color(0xFFD97706);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(999)),
      child: Text(s, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: color)),
    );
  }
}
