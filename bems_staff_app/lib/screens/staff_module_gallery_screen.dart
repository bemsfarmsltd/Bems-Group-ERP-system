import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/staff_models.dart';
import '../services/staff_api_service.dart';
import '../services/staff_storage_service.dart';
import '../theme/subsidiary_theme.dart';
import 'staff_main_screen.dart';
import 'staff_admin_chat_screen.dart';
import 'modules/staff_module_workstation_screen.dart';
import 'modules/staff_operations_screen.dart';
import 'modules/staff_hr_screen.dart';
import 'modules/hr/digital_id_card_screen.dart';

class StaffModuleGalleryScreen extends StatefulWidget {
  final StaffUser user;

  const StaffModuleGalleryScreen({super.key, required this.user});

  @override
  State<StaffModuleGalleryScreen> createState() => _StaffModuleGalleryScreenState();
}

class _StaffModuleGalleryScreenState extends State<StaffModuleGalleryScreen> with WidgetsBindingObserver {
  late StaffUser _user;
  String _searchQuery = '';
  bool _refreshingAccess = false;
  final TextEditingController _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _user = widget.user;
    _refreshAccess();
  }

  Future<void> _refreshAccess() async {
    if (_refreshingAccess) return;
    setState(() => _refreshingAccess = true);
    try {
      final fresh = await StaffApiService.fetchFreshSessionUser(_user);
      if (fresh != null && mounted) {
        await StaffStorageService.saveUser(fresh);
        if (mounted) setState(() => _user = fresh);
      }
    } finally {
      if (mounted) setState(() => _refreshingAccess = false);
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _refreshAccess();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final modules = _getEnterpriseModules(_user)
        .where((m) => m.id.toLowerCase() != 'control-center' && m.id.toLowerCase() != 'control_center')
        .toList();
    final filtered = _searchQuery.isEmpty
        ? modules
        : modules.where((m) {
            final q = _searchQuery.toLowerCase();
            return m.title.toLowerCase().contains(q) ||
                m.description.toLowerCase().contains(q) ||
                m.eyebrow.toLowerCase().contains(q);
          }).toList();

    final financeItem = filtered.where((m) => m.id == 'finance').firstOrNull;
    final projectsItem = filtered.where((m) => m.id == 'projects').firstOrNull;
    final otherItems = filtered.where((m) => m.id != 'finance' && m.id != 'projects').toList();

    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final isDesktop = constraints.maxWidth >= 880;
            return SingleChildScrollView(
              padding: EdgeInsets.symmetric(
                horizontal: isDesktop ? 28 : 16,
                vertical: isDesktop ? 20 : 14,
              ),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 1160),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // Slim Staff Top Bar (Brand + Staff Info + Helpdesk + Refresh)
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Row(
                            children: [
                              const SubsidiaryLogoBadge(size: 38, borderRadius: 11),
                              const SizedBox(width: 10),
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    (_user.subsidiary.isNotEmpty ? _user.subsidiary : 'BEMS Group').toUpperCase(),
                                    style: const TextStyle(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w900,
                                      letterSpacing: 0.5,
                                      color: Color(0xFF0F172A),
                                    ),
                                  ),
                                  Text(
                                    '${_user.fullName} · ${_user.employeeNumber}',
                                    style: const TextStyle(fontSize: 10.5, color: Color(0xFF64748B), fontWeight: FontWeight.w600),
                                  ),
                                ],
                              ),
                            ],
                          ),
                          Row(
                            children: [
                              InkWell(
                                onTap: () {
                                  Navigator.push(
                                    context,
                                    MaterialPageRoute(
                                      builder: (_) => DigitalIdCardScreen(user: _user, hrData: const {}),
                                    ),
                                  );
                                },
                                borderRadius: BorderRadius.circular(12),
                                child: Container(
                                  height: 34,
                                  padding: const EdgeInsets.symmetric(horizontal: 11),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFF0F172A),
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: const Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Icon(Icons.badge_outlined, size: 15, color: Colors.white),
                                      SizedBox(width: 5),
                                      Text('Staff ID', style: TextStyle(color: Colors.white, fontSize: 11.5, fontWeight: FontWeight.w800)),
                                    ],
                                  ),
                                ),
                              ),
                              const SizedBox(width: 4),
                              IconButton(
                                icon: Icon(
                                  Icons.refresh_rounded,
                                  color: _refreshingAccess ? SubsidiaryTheme.current.color : const Color(0xFF64748B),
                                  size: 20,
                                ),
                                tooltip: 'Refresh Access',
                                onPressed: _refreshingAccess ? null : _refreshAccess,
                              ),
                              IconButton(
                                icon: Icon(Icons.chat_bubble_outline_rounded, color: SubsidiaryTheme.current.color, size: 20),
                                tooltip: 'Admin Helpdesk',
                                onPressed: () {
                                  Navigator.push(
                                    context,
                                    MaterialPageRoute(builder: (_) => StaffAdminChatScreen(currentUser: _user)),
                                  );
                                },
                              ),
                            ],
                          ),
                        ],
                      ),

                      const SizedBox(height: 18),

                      // BENTO ROW 1 (Admin Module Screen style)
                      if (isDesktop)
                        IntrinsicHeight(
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              if (financeItem != null) ...[
                                Expanded(
                                  flex: 3,
                                  child: _buildBentoHeroCard(
                                    financeItem,
                                    bgColor: const Color(0xFFFFFBF5),
                                    borderColor: const Color(0xFFFED7AA),
                                  ),
                                ),
                                const SizedBox(width: 16),
                              ],
                              Expanded(
                                flex: 3,
                                child: Column(
                                  children: [
                                    _buildSearchHeaderCard(),
                                    const SizedBox(height: 14),
                                    _buildDownloadApkCard(),
                                  ],
                                ),
                              ),
                              if (projectsItem != null) ...[
                                const SizedBox(width: 16),
                                Expanded(
                                  flex: 3,
                                  child: _buildBentoHeroCard(
                                    projectsItem,
                                    bgColor: const Color(0xFFF4F9FF),
                                    borderColor: const Color(0xFFBFDBFE),
                                  ),
                                ),
                              ],
                            ],
                          ),
                        )
                      else ...[
                        _buildSearchHeaderCard(),
                        const SizedBox(height: 14),
                        if (financeItem != null) ...[
                          _buildBentoHeroCard(
                            financeItem,
                            bgColor: const Color(0xFFFFFBF5),
                            borderColor: const Color(0xFFFED7AA),
                            minHeight: 190,
                          ),
                          const SizedBox(height: 12),
                        ],
                        if (projectsItem != null) ...[
                          _buildBentoHeroCard(
                            projectsItem,
                            bgColor: const Color(0xFFF4F9FF),
                            borderColor: const Color(0xFFBFDBFE),
                            minHeight: 190,
                          ),
                          const SizedBox(height: 12),
                        ],
                      ],

                      if (filtered.isEmpty) ...[
                        const SizedBox(height: 18),
                        Container(
                          padding: const EdgeInsets.all(24),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(color: const Color(0xFFE2E8F0)),
                          ),
                          child: Column(
                            children: [
                              const Icon(Icons.lock_outline_rounded, size: 36, color: Color(0xFF94A3B8)),
                              const SizedBox(height: 12),
                              Text(
                                _searchQuery.isNotEmpty ? 'No matching systems found' : 'No systems assigned yet',
                                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Color(0xFF0F172A)),
                              ),
                              const SizedBox(height: 6),
                              Text(
                                _searchQuery.isNotEmpty
                                    ? 'Try clearing your search filter.'
                                    : 'Ask your System Admin or HR to enable modules for your account in Control Center.',
                                textAlign: TextAlign.center,
                                style: const TextStyle(fontSize: 12.5, color: Color(0xFF64748B)),
                              ),
                            ],
                          ),
                        ),
                      ] else if (otherItems.isNotEmpty) ...[
                        const SizedBox(height: 16),
                        GridView.builder(
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                            crossAxisCount: isDesktop ? 3 : 2,
                            mainAxisSpacing: 14,
                            crossAxisSpacing: 14,
                            mainAxisExtent: isDesktop ? 132 : 140,
                          ),
                          itemCount: otherItems.length,
                          itemBuilder: (context, idx) => _buildCompactBentoCard(otherItems[idx]),
                        ),
                      ],

                      if (!isDesktop) ...[
                        const SizedBox(height: 14),
                        _buildDownloadApkCard(),
                      ],
                    ],
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _buildSearchHeaderCard() {
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
          const Text(
            'Enterprise Management Systems',
            style: TextStyle(fontSize: 19, fontWeight: FontWeight.w900, color: Color(0xFF0F172A), letterSpacing: -0.4),
          ),
          const SizedBox(height: 3),
          const Text(
            'Staff Workspace · Unified Workspace',
            style: TextStyle(fontSize: 12, color: Color(0xFF64748B), fontWeight: FontWeight.w500),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _searchController,
            onChanged: (v) => setState(() => _searchQuery = v.trim()),
            style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: Color(0xFF0F172A)),
            decoration: InputDecoration(
              hintText: 'Search systems...',
              hintStyle: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12.5),
              prefixIcon: const Icon(Icons.search_rounded, color: Color(0xFF94A3B8), size: 17),
              suffixIcon: _searchQuery.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.close_rounded, size: 15, color: Color(0xFF64748B)),
                      onPressed: () {
                        _searchController.clear();
                        setState(() => _searchQuery = '');
                      },
                    )
                  : null,
              filled: true,
              fillColor: const Color(0xFFF8FAFC),
              contentPadding: const EdgeInsets.symmetric(vertical: 10),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide(color: SubsidiaryTheme.current.color, width: 1.5),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDownloadApkCard() {
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
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: const Color(0xFFFFF7ED),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: const Color(0xFFFED7AA)),
                ),
                child: Icon(Icons.smartphone_rounded, size: 18, color: SubsidiaryTheme.current.color),
              ),
              const Text(
                'Download Center',
                style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: Color(0xFF94A3B8)),
              ),
            ],
          ),
          const SizedBox(height: 14),
          const Text(
            'BEMS Mobile',
            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: Color(0xFF0F172A)),
          ),
          const SizedBox(height: 2),
          const Text(
            'Android APK',
            style: TextStyle(fontSize: 11.5, color: Color(0xFF64748B)),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: () async {
                final uri = Uri.parse(StaffApiService.resolveUrl('/download/staff-app.apk'));
                await launchUrl(uri, mode: LaunchMode.externalApplication);
              },
              icon: const Icon(Icons.download_rounded, size: 15),
              label: const Text('Download APK', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800)),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF0F172A),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 11),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                elevation: 0,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBentoHeroCard(
    _ModuleItem item, {
    required Color bgColor,
    required Color borderColor,
    double minHeight = 290,
  }) {
    return InkWell(
      onTap: () {
        HapticFeedback.lightImpact();
        item.onTap(context);
      },
      borderRadius: BorderRadius.circular(20),
      child: Container(
        constraints: BoxConstraints(minHeight: minHeight),
        padding: const EdgeInsets.all(22),
        decoration: BoxDecoration(
          color: bgColor,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: borderColor),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    gradient: LinearGradient(colors: item.gradient, begin: Alignment.topLeft, end: Alignment.bottomRight),
                    borderRadius: BorderRadius.circular(13),
                    boxShadow: [
                      BoxShadow(color: item.gradient.first.withOpacity(0.28), blurRadius: 8, offset: const Offset(0, 3)),
                    ],
                  ),
                  child: Icon(item.icon, color: Colors.white, size: 22),
                ),
                Container(
                  width: 8,
                  height: 8,
                  decoration: const BoxDecoration(color: Color(0xFF10B981), shape: BoxShape.circle),
                ),
              ],
            ),
            const SizedBox(height: 36),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.title,
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Color(0xFF0F172A), letterSpacing: -0.3),
                ),
                const SizedBox(height: 5),
                Text(
                  item.description,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12, color: Color(0xFF64748B), height: 1.4),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Text(
                      'Open system',
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: item.gradient.first),
                    ),
                    const SizedBox(width: 4),
                    Icon(Icons.arrow_forward_rounded, size: 14, color: item.gradient.first),
                  ],
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCompactBentoCard(_ModuleItem item) {
    return InkWell(
      onTap: () {
        HapticFeedback.lightImpact();
        item.onTap(context);
      },
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
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Container(
                  width: 34,
                  height: 34,
                  decoration: BoxDecoration(
                    color: item.gradient.first.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(item.icon, color: item.gradient.first, size: 18),
                ),
                const Icon(Icons.arrow_forward_rounded, size: 15, color: Color(0xFFCBD5E1)),
              ],
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: Color(0xFF0F172A)),
                ),
                const SizedBox(height: 2),
                Text(
                  item.description,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 11, color: Color(0xFF64748B)),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  List<_ModuleItem> _getEnterpriseModules(StaffUser user) {
    return [
      // 1. Financial Management System
      _ModuleItem(
        id: 'finance',
        eyebrow: 'FINANCIAL MANAGEMENT',
        title: 'Financial Management System',
        description: 'Budgeting, fund requisitions, approvals, treasury, disbursements, and expenditure retirement.',
        badgeText: 'ACTIVE',
        badgeColor: const Color(0xFF059669),
        icon: Icons.account_balance_wallet_rounded,
        gradient: [SubsidiaryTheme.current.color, const Color(0xFFC2410C)],
        onTap: (ctx) async {
          await Navigator.push(
            ctx,
            MaterialPageRoute(builder: (_) => StaffMainScreen(user: user, fromGallery: true)),
          );
          if (mounted) await _refreshAccess();
        },
      ),

      // 2. Project Management System
      _ModuleItem(
        id: 'projects',
        eyebrow: 'PROJECT EXECUTION',
        title: 'Project Management System',
        description: 'Project tracking, milestone execution, deliverables, and capital expenditure oversight.',
        badgeText: 'PIPELINE',
        badgeColor: const Color(0xFF64748B),
        icon: Icons.assignment_turned_in_rounded,
        gradient: [const Color(0xFF0284C7), const Color(0xFF0369A1)],
        onTap: (ctx) {
          Navigator.push(
            ctx,
            MaterialPageRoute(
              builder: (_) => StaffModuleWorkstationScreen(
                user: user,
                config: ModuleConfig(
                  id: 'projects',
                  eyebrow: 'PROJECT EXECUTION',
                  title: 'Project Management System',
                  subtitle: 'Milestones, Deliverables & Capital Oversight',
                  description: 'Project tracking, milestone execution, deliverables, and capital expenditure oversight across ${widget.user.subsidiary.isNotEmpty ? widget.user.subsidiary : 'your organization'}.',
                  icon: Icons.assignment_turned_in_rounded,
                  gradientColors: const [Color(0xFF0284C7), Color(0xFF0369A1)],
                  statusText: 'Pipeline (Phase 2)',
                  quickActions: const [
                    {'title': 'Milestone Deliverables', 'desc': 'Track milestone progress and deliverables', 'icon': Icons.task_alt_rounded, 'color': Color(0xFF0284C7)},
                    {'title': 'Task Execution', 'desc': 'Monitor team work packages and deadlines', 'icon': Icons.checklist_rounded, 'color': Color(0xFF10B981)},
                  ],
                  metricCards: [
                    {'label': 'STATUS', 'value': 'Pipeline', 'sub': 'Phase 2 Development'},
                    {'label': 'SCOPE', 'value': 'Group-wide', 'sub': 'Capital Projects'},
                  ],
                  sampleTasks: [
                    {'task': 'Project Milestone Framework', 'details': 'In active design', 'time': 'Phase 2'},
                  ],
                ),
              ),
            ),
          );
        },
      ),

      // 3. Human Resource Management System
      _ModuleItem(
        id: 'hr',
        eyebrow: 'HUMAN CAPITAL',
        title: 'Human Resources',
        description: 'Attendance, leave requests, payslips, digital ID card & HR requests.',
        badgeText: 'ACTIVE',
        badgeColor: const Color(0xFF059669),
        icon: Icons.people_alt_rounded,
        gradient: [const Color(0xFF6366F1), const Color(0xFF4F46E5)],
        onTap: (ctx) {
          Navigator.push(
            ctx,
            MaterialPageRoute(builder: (_) => StaffHrScreen(user: _user)),
          );
        },
      ),

      // 4. Operations Management System
      _ModuleItem(
        id: 'operations',
        eyebrow: 'FIELD OPERATIONS',
        title: 'Operations Management System',
        description: 'Work orders, site dispatch, service requests, and daily field execution.',
        badgeText: 'ACTIVE',
        badgeColor: const Color(0xFF059669),
        icon: Icons.local_shipping_rounded,
        gradient: [const Color(0xFF059669), const Color(0xFF047857)],
        onTap: (ctx) {
          Navigator.push(
            ctx,
            MaterialPageRoute(builder: (_) => StaffOperationsScreen(user: user)),
          );
        },
      ),

      // 5. Media Management System
      _ModuleItem(
        id: 'media',
        eyebrow: 'MEDIA & CREATIVE',
        title: 'Media Management System',
        description: 'Media production workflows, studio scheduling, creative deliverables, and digital media archives.',
        badgeText: 'PIPELINE',
        badgeColor: const Color(0xFF64748B),
        icon: Icons.videocam_rounded,
        gradient: [const Color(0xFFDB2777), const Color(0xFFBE185D)],
        onTap: (ctx) {
          Navigator.push(
            ctx,
            MaterialPageRoute(
              builder: (_) => StaffModuleWorkstationScreen(
                user: user,
                config: const ModuleConfig(
                  id: 'media',
                  eyebrow: 'MEDIA & CREATIVE',
                  title: 'Media Management System',
                  subtitle: 'Studio Arella Media Production & Archives',
                  description: 'Media production workflows, studio scheduling, creative deliverables, and digital media archives.',
                  icon: Icons.videocam_rounded,
                  gradientColors: [Color(0xFFDB2777), Color(0xFFBE185D)],
                  statusText: 'Pipeline (Phase 2)',
                  quickActions: [
                    {'title': 'Studio Production Schedule', 'desc': 'Manage studio shoot calendar and bookings', 'icon': Icons.video_library_rounded, 'color': Color(0xFFDB2777)},
                    {'title': 'Digital Creative Assets', 'desc': 'Access photography and broadcast archives', 'icon': Icons.perm_media_rounded, 'color': Color(0xFF7C3AED)},
                  ],
                  metricCards: [
                    {'label': 'STATUS', 'value': 'Pipeline', 'sub': 'Phase 2 Development'},
                    {'label': 'SUBSIDIARY', 'value': 'Studio Arella', 'sub': 'Creative Agency'},
                  ],
                  sampleTasks: [
                    {'task': 'Studio Shoot Pipeline', 'details': 'In active design', 'time': 'Phase 2'},
                  ],
                ),
              ),
            ),
          );
        },
      ),

      // 6. Innovation Management System
      _ModuleItem(
        id: 'innovation',
        eyebrow: 'TECHNOLOGY & R&D',
        title: 'Innovation Management System',
        description: 'Proprietary software technologies, digital platforms, system architecture, and technology R&D.',
        badgeText: 'PIPELINE',
        badgeColor: const Color(0xFF64748B),
        icon: Icons.code_rounded,
        gradient: [const Color(0xFF0891B2), const Color(0xFF0E7490)],
        onTap: (ctx) {
          Navigator.push(
            ctx,
            MaterialPageRoute(
              builder: (_) => StaffModuleWorkstationScreen(
                user: user,
                config: const ModuleConfig(
                  id: 'innovation',
                  eyebrow: 'TECHNOLOGY & R&D',
                  title: 'Innovation Management System',
                  subtitle: 'Proprietary Platforms & Digital Systems',
                  description: 'Proprietary software technologies, digital platforms, system architecture, and technology R&D.',
                  icon: Icons.code_rounded,
                  gradientColors: [Color(0xFF0891B2), Color(0xFF0E7490)],
                  statusText: 'Pipeline (Phase 2)',
                  quickActions: [
                    {'title': 'SmartAIRS Platform', 'desc': 'State revenue automation and field terminals', 'icon': Icons.terminal_rounded, 'color': Color(0xFF0891B2)},
                    {'title': 'Software Architecture', 'desc': 'Cloud services and core ERP infrastructure', 'icon': Icons.code_rounded, 'color': Color(0xFF7C3AED)},
                  ],
                  metricCards: [
                    {'label': 'STATUS', 'value': 'Pipeline', 'sub': 'Phase 2 Development'},
                    {'label': 'TECH SUBSIDIARY', 'value': 'BemsSoft Hub', 'sub': 'Enterprise Systems'},
                  ],
                  sampleTasks: [
                    {'task': 'Cloud Infrastructure Framework', 'details': 'In active design', 'time': 'Phase 2'},
                  ],
                ),
              ),
            ),
          );
        },
      ),
    ];
  }
}

class _ModuleItem {
  final String id;
  final String eyebrow;
  final String title;
  final String description;
  final String badgeText;
  final Color badgeColor;
  final IconData icon;
  final List<Color> gradient;
  final void Function(BuildContext) onTap;

  const _ModuleItem({
    required this.id,
    required this.eyebrow,
    required this.title,
    required this.description,
    required this.badgeText,
    required this.badgeColor,
    required this.icon,
    required this.gradient,
    required this.onTap,
  });
}
