import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../../models/staff_models.dart';
import '../../../services/staff_api_service.dart';
import '../../../theme/subsidiary_theme.dart';

class DigitalIdCardScreen extends StatefulWidget {
  final StaffUser user;
  final Map<String, dynamic> hrData;
  final VoidCallback? onRequestPhysicalCard;

  const DigitalIdCardScreen({
    super.key,
    required this.user,
    required this.hrData,
    this.onRequestPhysicalCard,
  });

  @override
  State<DigitalIdCardScreen> createState() => _DigitalIdCardScreenState();
}

class _DigitalIdCardScreenState extends State<DigitalIdCardScreen> {
  bool _showBack = false;
  bool _loading = false;
  String? _loadError;
  late Map<String, dynamic> _hrData;

  @override
  void initState() {
    super.initState();
    _hrData = Map<String, dynamic>.from(widget.hrData);
    if (_hrData.isEmpty) {
      _refreshCard();
    }
  }

  Future<void> _refreshCard() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    try {
      final fresh = await StaffApiService.fetchMyHrWorkspace(widget.user);
      if (!mounted) return;
      setState(() {
        _hrData = fresh;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loadError = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  String _fmtDate(dynamic iso) {
    if (iso == null) return '—';
    final dt = DateTime.tryParse(iso.toString());
    if (dt == null) return iso.toString();
    return DateFormat('d MMM yyyy').format(dt.toLocal());
  }

  Color _parseHex(String? hex, Color fallback) {
    if (hex == null || hex.trim().isEmpty) return fallback;
    final clean = hex.trim().replaceFirst('#', '');
    if (clean.length == 6) {
      final val = int.tryParse('FF$clean', radix: 16);
      if (val != null) return Color(val);
    }
    return fallback;
  }

  @override
  Widget build(BuildContext context) {
    final profile = (_hrData['profile'] as Map<String, dynamic>?) ?? {};
    final idCard = (_hrData['idCard'] as Map<String, dynamic>?) ?? {};

    final primaryColor = _parseHex(
      idCard['customColor']?.toString() ?? idCard['accentDefault']?.toString(),
      SubsidiaryTheme.current.color,
    );
    final secondaryColor = _parseHex(
      idCard['secondaryColor']?.toString() ?? idCard['secondaryDefault']?.toString(),
      const Color(0xFF0F172A),
    );

    final cardNumber = idCard['cardNumber']?.toString() ?? widget.user.employeeNumber;
    final cardLevel = (idCard['cardLevel'] is num) ? (idCard['cardLevel'] as num).toInt() : 1;
    final cardStatus = (idCard['status']?.toString() ?? 'DIGITAL_ACTIVE').toUpperCase();
    final isIssuedByAdmin = idCard['isIssuedInRegistry'] == true && cardStatus == 'ACTIVE';
    final isRevoked = cardStatus == 'REVOKED';
    final hasPendingPhysical = idCard['hasPendingPhysicalRequest'] == true;
    final pendingRef = idCard['pendingRequestCode']?.toString();
    final qrDataUrl = idCard['qrDataUrl']?.toString();

    Uint8List? qrBytes;
    if (qrDataUrl != null && qrDataUrl.contains(',')) {
      try {
        qrBytes = base64Decode(qrDataUrl.split(',').last);
      } catch (_) {}
    }

    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        title: const Text(
          'Official Digital Staff ID',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: Color(0xFF0F172A)),
        ),
        leading: IconButton(
          icon: const Icon(Icons.close_rounded, color: Color(0xFF0F172A)),
          onPressed: () => Navigator.pop(context),
        ),
        actions: [
          IconButton(
            icon: Icon(Icons.refresh_rounded, color: primaryColor, size: 20),
            tooltip: 'Refresh ID Card',
            onPressed: _loading ? null : _refreshCard,
          ),
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: TextButton.icon(
              onPressed: () => setState(() => _showBack = !_showBack),
              icon: Icon(_showBack ? Icons.badge_outlined : Icons.qr_code_2_rounded, size: 18, color: primaryColor),
              label: Text(
                _showBack ? 'View Front' : 'View Back',
                style: TextStyle(fontWeight: FontWeight.w800, color: primaryColor),
              ),
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: _loading
            ? Center(child: CircularProgressIndicator(color: primaryColor))
            : _loadError != null && _hrData.isEmpty
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.error_outline_rounded, size: 40, color: Color(0xFFDC2626)),
                          const SizedBox(height: 10),
                          Text(_loadError!, textAlign: TextAlign.center),
                          const SizedBox(height: 12),
                          ElevatedButton(
                            onPressed: _refreshCard,
                            style: ElevatedButton.styleFrom(backgroundColor: primaryColor, foregroundColor: Colors.white),
                            child: const Text('Retry'),
                          ),
                        ],
                      ),
                    ),
                  )
                : Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 380),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    padding: const EdgeInsets.all(4),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(color: const Color(0xFFE2E8F0)),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: _toggleBtn('Front Side', !_showBack, primaryColor, () => setState(() => _showBack = false)),
                        ),
                        Expanded(
                          child: _toggleBtn('Back & QR Verify', _showBack, primaryColor, () => setState(() => _showBack = true)),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),

                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 260),
                    child: (cardLevel == 9 || cardLevel == 10)
                        ? (_showBack
                            ? _buildExecutiveBackCard(cardLevel, profile, idCard, cardNumber, qrBytes)
                            : _buildExecutiveFrontCard(cardLevel, profile, idCard, cardNumber))
                        : (_showBack
                            ? _buildAdminBackCard(primaryColor, secondaryColor, profile, idCard, cardNumber, qrBytes)
                            : _buildAdminFrontCard(primaryColor, secondaryColor, profile, idCard, cardNumber)),
                  ),

                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    decoration: BoxDecoration(
                      color: isRevoked ? const Color(0xFFFEF2F2) : Colors.white,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: isRevoked ? const Color(0xFFFECACA) : const Color(0xFFE2E8F0)),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          isRevoked
                              ? Icons.block_rounded
                              : isIssuedByAdmin
                                  ? Icons.verified_rounded
                                  : hasPendingPhysical
                                      ? Icons.hourglass_top_rounded
                                      : Icons.verified_user_outlined,
                          color: isRevoked
                              ? const Color(0xFFDC2626)
                              : isIssuedByAdmin
                                  ? const Color(0xFF059669)
                                  : hasPendingPhysical
                                      ? const Color(0xFFD97706)
                                      : primaryColor,
                          size: 19,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            isRevoked
                                ? 'Card Revoked by HR Administration'
                                : isIssuedByAdmin
                                    ? 'Issued by HR · Active Official Credential'
                                    : hasPendingPhysical
                                        ? 'Physical ID Request Active ($pendingRef)'
                                        : 'Approved Digital Credential · View-only',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: isRevoked ? const Color(0xFF991B1B) : const Color(0xFF334155),
                            ),
                          ),
                        ),
                        if (!hasPendingPhysical && widget.onRequestPhysicalCard != null)
                          TextButton(
                            onPressed: () {
                              Navigator.pop(context);
                              widget.onRequestPhysicalCard!();
                            },
                            child: Text('Request Print', style: TextStyle(fontWeight: FontWeight.w800, color: primaryColor, fontSize: 12)),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _toggleBtn(String label, bool active, Color accent, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(999),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 9),
        decoration: BoxDecoration(
          color: active ? accent : Colors.transparent,
          borderRadius: BorderRadius.circular(999),
        ),
        child: Center(
          child: Text(
            label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w800,
              color: active ? Colors.white : const Color(0xFF64748B),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildExecutiveFrontCard(
    int level,
    Map<String, dynamic> profile,
    Map<String, dynamic> idCard,
    String cardNumber,
  ) {
    final isGmd = level == 10;
    final accent = isGmd ? const Color(0xFFB45309) : const Color(0xFF0F172A);
    final borderCol = isGmd ? const Color(0xFFD97706) : const Color(0xFF475569);
    final spineColors = isGmd
        ? [const Color(0xFFFEF3C7), const Color(0xFFF59E0B), const Color(0xFFB45309)]
        : [const Color(0xFFE2E8F0), const Color(0xFF64748B), const Color(0xFF0F172A)];
    final bgColors = isGmd
        ? [const Color(0xFFFFFBEB), Colors.white, const Color(0xFFFEF3C7)]
        : [const Color(0xFFF8FAFC), Colors.white, const Color(0xFFE2E8F0)];

    final fullName = profile['legalName']?.toString() ?? widget.user.fullName;
    final subName = profile['subsidiaryName']?.toString() ?? 'BEMS Group';
    final jobTitle = profile['jobTitle']?.toString() ?? 'Chief Operating Officer';
    final dept = profile['departmentName']?.toString() ?? 'Executive Management & Leadership';
    final clearanceItems = (idCard['systemClearance'] as List?)?.map((e) => e.toString()).toList() ??
        (isGmd ? ['Full Group Clearance', 'GMD Wallet & AI', 'All Modules'] : ['Executive Clearance', 'Control Center', 'Data Center L9']);

    return Container(
      key: const ValueKey('exec_front'),
      width: double.infinity,
      height: 500,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: borderCol, width: 2),
        gradient: LinearGradient(colors: bgColors, begin: Alignment.topLeft, end: Alignment.bottomRight),
        boxShadow: [BoxShadow(color: const Color(0xFF0F172A).withOpacity(0.18), blurRadius: 28, offset: const Offset(0, 12))],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(18),
        child: Row(
          children: [
            // Left Vertical Spine
            Container(
              width: 42,
              padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 4),
              decoration: BoxDecoration(gradient: LinearGradient(colors: spineColors, begin: Alignment.topCenter, end: Alignment.bottomCenter)),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  RotatedBox(
                    quarterTurns: 3,
                    child: Text(
                      isGmd ? 'L10 · SOVEREIGN MASTER' : 'L9 · EXECUTIVE & DC',
                      style: TextStyle(
                        fontSize: 9,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 2.0,
                        color: isGmd ? const Color(0xFF451A03) : Colors.white,
                      ),
                    ),
                  ),
                  Container(
                    width: 26,
                    height: 26,
                    decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
                    child: Center(
                      child: Text('L$level', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: Color(0xFF0F172A))),
                    ),
                  ),
                ],
              ),
            ),
            // Card Body
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    // Top Header + Gold EMV Chip
                    Container(
                      padding: const EdgeInsets.only(bottom: 10),
                      decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: Color(0xFFE2E8F0)))),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(
                            child: Row(
                              children: [
                                const SubsidiaryLogoBadge(size: 32, borderRadius: 8),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(subName, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w900, color: Color(0xFF0F172A))),
                                      Text(
                                        isGmd ? 'EXECUTIVE SOVEREIGN PASS' : 'PLATINUM EXECUTIVE PASS',
                                        style: TextStyle(fontSize: 8.5, fontWeight: FontWeight.w900, letterSpacing: 1.0, color: accent),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Container(
                            width: 28,
                            height: 20,
                            decoration: BoxDecoration(
                              gradient: const LinearGradient(colors: [Color(0xFFFDE68A), Color(0xFFD97706)]),
                              borderRadius: BorderRadius.circular(5),
                              border: Border.all(color: const Color(0xFFB45309)),
                            ),
                          ),
                        ],
                      ),
                    ),

                    // Center Avatar + Name + Clearance Pills
                    Column(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(3),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(18),
                            border: Border.all(color: borderCol, width: 2),
                          ),
                          child: StaffAvatar(
                            avatarUrl: profile['avatarUrl']?.toString() ?? widget.user.avatarUrl,
                            fullName: fullName,
                            radius: 44,
                            borderRadius: 14,
                            accentColor: accent,
                          ),
                        ),
                        const SizedBox(height: 12),
                        Text(fullName, textAlign: TextAlign.center, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: Color(0xFF0F172A))),
                        const SizedBox(height: 2),
                        Text(jobTitle, textAlign: TextAlign.center, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: accent)),
                        const SizedBox(height: 2),
                        Text(dept, textAlign: TextAlign.center, style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w600, color: Color(0xFF64748B))),
                        const SizedBox(height: 12),
                        Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          alignment: WrapAlignment.center,
                          children: clearanceItems
                              .map((c) => Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                    decoration: BoxDecoration(
                                      color: Colors.white.withOpacity(0.92),
                                      borderRadius: BorderRadius.circular(6),
                                      border: Border.all(color: const Color(0xFFCBD5E1)),
                                    ),
                                    child: Text(c, style: const TextStyle(fontSize: 9.5, fontWeight: FontWeight.w800, color: Color(0xFF0F172A))),
                                  ))
                              .toList(),
                        ),
                      ],
                    ),

                    // Bottom Barcode + DC LEVEL 9
                    Container(
                      padding: const EdgeInsets.only(top: 10),
                      decoration: const BoxDecoration(border: Border(top: BorderSide(color: Color(0xFFE2E8F0)))),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(child: _buildBarcodeBlock(cardNumber)),
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: accent.withOpacity(0.08),
                              borderRadius: BorderRadius.circular(6),
                              border: Border.all(color: accent.withOpacity(0.3)),
                            ),
                            child: Text(
                              isGmd ? 'ALL-GROUP' : 'DC LEVEL 9',
                              style: TextStyle(fontSize: 8.5, fontWeight: FontWeight.w900, color: accent),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildExecutiveBackCard(
    int level,
    Map<String, dynamic> profile,
    Map<String, dynamic> idCard,
    String cardNumber,
    Uint8List? qrBytes,
  ) {
    final isGmd = level == 10;
    final accent = isGmd ? const Color(0xFFB45309) : const Color(0xFF0F172A);
    final borderCol = isGmd ? const Color(0xFFD97706) : const Color(0xFF475569);
    final spineColors = isGmd
        ? [const Color(0xFFFEF3C7), const Color(0xFFF59E0B), const Color(0xFFB45309)]
        : [const Color(0xFFE2E8F0), const Color(0xFF64748B), const Color(0xFF0F172A)];
    final bgColors = isGmd
        ? [const Color(0xFFFFFBEB), Colors.white, const Color(0xFFFEF3C7)]
        : [const Color(0xFFF8FAFC), Colors.white, const Color(0xFFE2E8F0)];

    final subName = profile['subsidiaryName']?.toString() ?? 'BEMS Group';
    final facilityScope = idCard['facilityScope']?.toString() ?? 'Executive Suites, Treasury Vault & Data Center';
    final sigUrl = idCard['managementSignatureUrl']?.toString();

    return Container(
      key: const ValueKey('exec_back'),
      width: double.infinity,
      height: 500,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: borderCol, width: 2),
        gradient: LinearGradient(colors: bgColors, begin: Alignment.topLeft, end: Alignment.bottomRight),
        boxShadow: [BoxShadow(color: const Color(0xFF0F172A).withOpacity(0.18), blurRadius: 28, offset: const Offset(0, 12))],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(18),
        child: Row(
          children: [
            Container(
              width: 34,
              decoration: BoxDecoration(gradient: LinearGradient(colors: spineColors, begin: Alignment.topCenter, end: Alignment.bottomCenter)),
              child: Center(
                child: RotatedBox(
                  quarterTurns: 3,
                  child: Text(
                    isGmd ? 'SOVEREIGN VERIFICATION' : 'EXECUTIVE VERIFICATION',
                    style: TextStyle(
                      fontSize: 8.5,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 2.0,
                      color: isGmd ? const Color(0xFF451A03) : Colors.white,
                    ),
                  ),
                ),
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Container(
                      padding: const EdgeInsets.only(bottom: 8),
                      decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: Color(0xFFE2E8F0)))),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(child: Text(subName, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w900, color: Color(0xFF0F172A)))),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(6), border: Border.all(color: const Color(0xFFCBD5E1))),
                            child: Text('L$level ${isGmd ? 'MASTER' : 'EXEC'}', style: TextStyle(fontSize: 9, fontWeight: FontWeight.w900, color: accent)),
                          ),
                        ],
                      ),
                    ),
                    Column(
                      children: [
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.all(6),
                              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(10), border: Border.all(color: const Color(0xFFE2E8F0))),
                              child: qrBytes != null
                                  ? Image.memory(qrBytes, width: 84, height: 84, fit: BoxFit.contain)
                                  : const Icon(Icons.qr_code_2_rounded, size: 80, color: Color(0xFF0F172A)),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Container(
                                padding: const EdgeInsets.all(10),
                                decoration: BoxDecoration(color: Colors.white.withOpacity(0.95), borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFE2E8F0))),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const Text('ISSUED', style: TextStyle(fontSize: 8, fontWeight: FontWeight.w900, color: Color(0xFF94A3B8))),
                                    Text(_fmtDate(idCard['issuedAt']), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900, color: Color(0xFF0F172A))),
                                    const SizedBox(height: 6),
                                    const Text('EXPIRES', style: TextStyle(fontSize: 8, fontWeight: FontWeight.w900, color: Color(0xFF94A3B8))),
                                    Text(_fmtDate(idCard['expiresAt']), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900, color: Color(0xFF0F172A))),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 14),
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(color: Colors.white.withOpacity(0.95), borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFE2E8F0))),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('TERMS & CONDITIONS', style: TextStyle(fontSize: 9, fontWeight: FontWeight.w900, color: accent)),
                              const SizedBox(height: 4),
                              Text(
                                '• Property of $subName (BEMS Group). Non-transferable; wear visibly on duty.\n'
                                '• Valid for $facilityScope. Internal QR scan required for gated access.\n'
                                '• Report loss to HR/Security immediately.',
                                style: const TextStyle(fontSize: 10, color: Color(0xFF334155), height: 1.4),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    Container(
                      padding: const EdgeInsets.only(top: 10),
                      decoration: const BoxDecoration(border: Border(top: BorderSide(color: Color(0xFFE2E8F0)))),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              _buildSafeSignature(sigUrl),
                              const Text('AUTH. SIGNATURE', style: TextStyle(fontSize: 8, fontWeight: FontWeight.w800, color: Color(0xFF64748B))),
                            ],
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                const Text('SERIAL', style: TextStyle(fontSize: 7.5, fontWeight: FontWeight.w900, color: Color(0xFF94A3B8))),
                                Text(
                                  cardNumber,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w800, color: Color(0xFF334155)),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAdminFrontCard(
    Color primary,
    Color secondary,
    Map<String, dynamic> profile,
    Map<String, dynamic> idCard,
    String cardNumber,
  ) {
    final fullName = profile['legalName']?.toString() ?? widget.user.fullName;
    final subName = profile['subsidiaryName']?.toString() ?? 'BEMS Group';
    final jobTitle = profile['jobTitle']?.toString() ?? 'Staff Member';
    final email = profile['workEmail']?.toString() ?? widget.user.email;
    final empNo = profile['employeeNumber']?.toString() ?? widget.user.employeeNumber;
    final levelCode = idCard['levelCode']?.toString() ?? 'L1';
    final shortTitle = (idCard['shortTitle']?.toString() ?? 'STAFF').toUpperCase();

    return Container(
      key: const ValueKey('front'),
      width: double.infinity,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: const Color(0xFFE2E8F0)),
        boxShadow: [
          BoxShadow(color: const Color(0xFF0F172A).withOpacity(0.14), blurRadius: 26, offset: const Offset(0, 12)),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(22),
        child: Column(
          children: [
            // Curved Top Ribbon
            ClipPath(
              clipper: _TopWaveClipper(),
              child: Container(
                height: 44,
                decoration: BoxDecoration(
                  gradient: LinearGradient(colors: [primary, secondary]),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(22, 6, 22, 16),
              child: Column(
                children: [
                  const SubsidiaryLogoBadge(size: 38, borderRadius: 10),
                  const SizedBox(height: 8),
                  Text(
                    subName,
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: Color(0xFF0F172A)),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '$levelCode · $shortTitle',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w900, color: primary, letterSpacing: 0.6),
                  ),
                  const SizedBox(height: 18),

                  // Circular Avatar with Primary Ring
                  Container(
                    padding: const EdgeInsets.all(3),
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(color: primary, width: 2.5),
                    ),
                    child: StaffAvatar(
                      avatarUrl: profile['avatarUrl']?.toString() ?? widget.user.avatarUrl,
                      fullName: fullName,
                      radius: 42,
                      borderRadius: 42,
                      accentColor: primary,
                    ),
                  ),
                  const SizedBox(height: 14),

                  Text(
                    fullName,
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 18.5, fontWeight: FontWeight.w900, color: primary),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    jobTitle,
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Color(0xFF334155)),
                  ),
                  const SizedBox(height: 18),

                  // Dashed-style Info Box
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF8FAFC),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: primary.withOpacity(0.35)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Email: $email', style: const TextStyle(fontSize: 11.5, color: Color(0xFF334155), fontWeight: FontWeight.w600)),
                        const SizedBox(height: 4),
                        Text('Staff ID: $empNo · $levelCode', style: const TextStyle(fontSize: 11.5, color: Color(0xFF0F172A), fontWeight: FontWeight.w800)),
                      ],
                    ),
                  ),
                  const SizedBox(height: 18),
                  _buildBarcodeBlock(cardNumber),
                ],
              ),
            ),
            // Curved Bottom Ribbon
            ClipPath(
              clipper: _BottomWaveClipper(),
              child: Container(
                height: 32,
                decoration: BoxDecoration(
                  gradient: LinearGradient(colors: [secondary, primary]),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAdminBackCard(
    Color primary,
    Color secondary,
    Map<String, dynamic> profile,
    Map<String, dynamic> idCard,
    String cardNumber,
    Uint8List? qrBytes,
  ) {
    final subName = profile['subsidiaryName']?.toString() ?? 'BEMS Group';
    final levelCode = idCard['levelCode']?.toString() ?? 'L1';
    final facilityScope = idCard['facilityScope']?.toString() ?? 'Assigned Workspace Zones';
    final sigUrl = idCard['managementSignatureUrl']?.toString();

    return Container(
      key: const ValueKey('back'),
      width: double.infinity,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: const Color(0xFFE2E8F0)),
        boxShadow: [
          BoxShadow(color: const Color(0xFF0F172A).withOpacity(0.14), blurRadius: 26, offset: const Offset(0, 12)),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(22),
        child: Column(
          children: [
            ClipPath(
              clipper: _TopWaveClipper(),
              child: Container(
                height: 44,
                decoration: BoxDecoration(
                  gradient: LinearGradient(colors: [primary, secondary]),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(22, 6, 22, 16),
              child: Column(
                children: [
                  const SubsidiaryLogoBadge(size: 38, borderRadius: 10),
                  const SizedBox(height: 8),
                  Text(
                    subName,
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: Color(0xFF0F172A)),
                  ),
                  const SizedBox(height: 16),

                  // Terms & Conditions Box
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF8FAFC),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: primary.withOpacity(0.35)),
                    ),
                    child: Column(
                      children: [
                        Text(
                          'TERMS & CONDITIONS',
                          style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w900, color: primary, letterSpacing: 0.6),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          '• Property of $subName (BEMS Group). Non-transferable; wear visibly on duty.\n'
                          '• Valid for $facilityScope. Internal QR scan required for gated access.\n'
                          '• Report loss to HR/Security immediately. Surrender upon exit or revocation.',
                          style: const TextStyle(fontSize: 11, color: Color(0xFF334155), height: 1.45),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 18),

                  // QR Code + Issue/Expiry + Management Signature
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      Column(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(6),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(color: const Color(0xFFE2E8F0)),
                            ),
                            child: qrBytes != null
                                ? Image.memory(qrBytes, width: 88, height: 88, fit: BoxFit.contain)
                                : const Icon(Icons.qr_code_2_rounded, size: 84, color: Color(0xFF0F172A)),
                          ),
                          const SizedBox(height: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: primary.withOpacity(0.1),
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text(
                              '$levelCode · HMAC-SHA256',
                              style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w900, color: primary),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.center,
                          children: [
                            Text(
                              'Issued: ${_fmtDate(idCard['issuedAt'])}',
                              style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF334155)),
                            ),
                            Text(
                              'Expires: ${_fmtDate(idCard['expiresAt'])}',
                              style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF334155)),
                            ),
                            const SizedBox(height: 12),
                            _buildSafeSignature(sigUrl),
                            const Divider(height: 8),
                            const Text(
                              'AUTH. SIGNATURE',
                              style: TextStyle(fontSize: 9, fontWeight: FontWeight.w800, color: Color(0xFF64748B), letterSpacing: 0.6),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),
                  _buildBarcodeBlock(cardNumber),
                ],
              ),
            ),
            ClipPath(
              clipper: _BottomWaveClipper(),
              child: Container(
                height: 32,
                decoration: BoxDecoration(
                  gradient: LinearGradient(colors: [secondary, primary]),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSafeSignature(String? sigUrl) {
    const fallback = Text(
      'Authorized',
      style: TextStyle(fontStyle: FontStyle.italic, fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFF0F172A)),
    );
    if (sigUrl == null || sigUrl.trim().isEmpty) return fallback;
    final trimmed = sigUrl.trim();
    if (trimmed.toLowerCase().contains('svg')) return fallback;
    if (trimmed.startsWith('data:image/') && trimmed.contains(',')) {
      try {
        final bytes = base64Decode(trimmed.split(',').last);
        return SizedBox(
          height: 28,
          child: Image.memory(bytes, fit: BoxFit.contain, errorBuilder: (_, __, ___) => fallback),
        );
      } catch (_) {
        return fallback;
      }
    }
    return SizedBox(
      height: 28,
      child: Image.network(
        StaffApiService.resolveUrl(trimmed),
        fit: BoxFit.contain,
        errorBuilder: (_, __, ___) => fallback,
      ),
    );
  }

  Widget _buildBarcodeBlock(String cardNumber) {
    const widths = [2.0, 1.0, 3.0, 1.0, 2.0, 1.0, 1.0, 3.0, 2.0, 1.0, 2.0, 3.0, 1.0, 2.0, 1.0, 2.0, 1.0, 3.0, 1.0, 2.0, 2.0, 1.0, 3.0, 1.0];
    return Column(
      children: [
        SizedBox(
          height: 22,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: widths
                .map((w) => Container(
                      width: w,
                      height: 22,
                      margin: const EdgeInsets.symmetric(horizontal: 1.3),
                      color: const Color(0xFF0F172A),
                    ))
                .toList(),
          ),
        ),
        const SizedBox(height: 4),
        Text(
          cardNumber,
          style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: Color(0xFF334155), letterSpacing: 0.6),
        ),
      ],
    );
  }
}

class _TopWaveClipper extends CustomClipper<Path> {
  @override
  Path getClip(Size size) {
    final path = Path();
    path.lineTo(0, size.height * 0.72);
    path.quadraticBezierTo(size.width * 0.5, size.height * 1.15, size.width, size.height * 0.65);
    path.lineTo(size.width, 0);
    path.close();
    return path;
  }

  @override
  bool shouldReclip(covariant CustomClipper<Path> oldClipper) => false;
}

class _BottomWaveClipper extends CustomClipper<Path> {
  @override
  Path getClip(Size size) {
    final path = Path();
    path.moveTo(0, size.height * 0.35);
    path.quadraticBezierTo(size.width * 0.5, -size.height * 0.25, size.width, size.height * 0.28);
    path.lineTo(size.width, size.height);
    path.lineTo(0, size.height);
    path.close();
    return path;
  }

  @override
  bool shouldReclip(covariant CustomClipper<Path> oldClipper) => false;
}
