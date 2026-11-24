import 'package:flutter/material.dart';
import '../../models/staff_models.dart';
import '../../services/staff_api_service.dart';
import '../../theme/subsidiary_theme.dart';

class StaffProjectsScreen extends StatefulWidget {
  final StaffUser user;

  const StaffProjectsScreen({super.key, required this.user});

  @override
  State<StaffProjectsScreen> createState() => _StaffProjectsScreenState();
}

class _StaffProjectsScreenState extends State<StaffProjectsScreen> {
  int _tabIndex = 0; // 0: Projects & Timelines, 1: Tasks & Issues, 2: Project Chat, 3: Handover & Vault
  bool _loading = true;
  String? _error;

  List<dynamic> _projects = [];
  List<dynamic> _workItems = [];
  String _taskStatusFilter = 'ALL';
  String? _selectedChatProjectId;
  List<dynamic> _chatMessages = [];
  bool _loadingChat = false;
  bool _sendingChat = false;

  final TextEditingController _chatCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  @override
  void dispose() {
    _chatCtrl.dispose();
    super.dispose();
  }

  Color get _brandColor => SubsidiaryTheme.current.color;

  Future<void> _loadData() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final json = await StaffApiService.fetchStaffProjects(
        employeeId: widget.user.id,
        token: widget.user.token,
      );
      if (!mounted) return;
      final projects = (json['projects'] as List?) ?? [];
      final workItems = (json['workItems'] as List?) ?? [];
      setState(() {
        _projects = projects;
        _workItems = workItems;
        if (_selectedChatProjectId == null && projects.isNotEmpty) {
          _selectedChatProjectId = projects.first['id']?.toString();
        }
        _loading = false;
      });
      if (_selectedChatProjectId != null) {
        _loadChat(_selectedChatProjectId!);
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  Future<void> _loadChat(String projectId) async {
    setState(() => _loadingChat = true);
    try {
      final msgs = await StaffApiService.fetchProjectChat(
        employeeId: widget.user.id,
        projectId: projectId,
        token: widget.user.token,
      );
      if (!mounted) return;
      setState(() {
        _chatMessages = msgs;
        _loadingChat = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loadingChat = false);
    }
  }

  Future<void> _sendChat() async {
    final pid = _selectedChatProjectId;
    final text = _chatCtrl.text.trim();
    if (pid == null || text.isEmpty || _sendingChat) return;
    setState(() => _sendingChat = true);
    try {
      await StaffApiService.sendProjectChatMessage(
        employeeId: widget.user.id,
        projectId: pid,
        content: text,
        token: widget.user.token,
      );
      _chatCtrl.clear();
      await _loadChat(pid);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
        );
      }
    } finally {
      if (mounted) setState(() => _sendingChat = false);
    }
  }

  Future<void> _markDeliverableDone(String memberId) async {
    try {
      await StaffApiService.markMyDeliverableCompleted(
        employeeId: widget.user.id,
        memberId: memberId,
        token: widget.user.token,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Deliverable marked complete and synced to Project Management.')),
      );
      await _loadData();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
        );
      }
    }
  }

  Future<void> _updateTaskStatus(String workItemId, String nextStatus) async {
    try {
      await StaffApiService.updateProjectWorkItem(
        employeeId: widget.user.id,
        id: workItemId,
        patch: {'status': nextStatus},
        token: widget.user.token,
      );
      await _loadData();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
        );
      }
    }
  }

  void _openCreateTaskSheet() {
    if (_projects.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('You must be assigned to a project before creating a task.')),
      );
      return;
    }
    String selectedProjectId = _projects.first['id'].toString();
    String priority = 'MEDIUM';
    final titleCtrl = TextEditingController();
    final descCtrl = TextEditingController();
    final dueCtrl = TextEditingController();
    bool saving = false;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
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
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'Create Project Task',
                      style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: Color(0xFF0F172A)),
                    ),
                    IconButton(onPressed: () => Navigator.pop(ctx), icon: const Icon(Icons.close)),
                  ],
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  value: selectedProjectId,
                  decoration: const InputDecoration(
                    labelText: 'Project',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                  items: _projects.map<DropdownMenuItem<String>>((p) {
                    return DropdownMenuItem(
                      value: p['id'].toString(),
                      child: Text('${p['projectCode'] ?? ''} · ${p['name'] ?? 'Project'}', overflow: TextOverflow.ellipsis),
                    );
                  }).toList(),
                  onChanged: (v) => setModalState(() => selectedProjectId = v ?? selectedProjectId),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: titleCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Task Title',
                    hintText: 'e.g. Complete field wiring inspection',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: descCtrl,
                  maxLines: 3,
                  decoration: const InputDecoration(
                    labelText: 'Details / Acceptance Notes',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        value: priority,
                        decoration: const InputDecoration(
                          labelText: 'Priority',
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                        items: const [
                          DropdownMenuItem(value: 'LOW', child: Text('Low')),
                          DropdownMenuItem(value: 'MEDIUM', child: Text('Medium')),
                          DropdownMenuItem(value: 'HIGH', child: Text('High')),
                          DropdownMenuItem(value: 'URGENT', child: Text('Urgent')),
                        ],
                        onChanged: (v) => setModalState(() => priority = v ?? 'MEDIUM'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: TextField(
                        controller: dueCtrl,
                        decoration: const InputDecoration(
                          labelText: 'Due Date (YYYY-MM-DD)',
                          hintText: '2026-12-01',
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: _brandColor,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    onPressed: saving
                        ? null
                        : () async {
                            if (titleCtrl.text.trim().isEmpty) return;
                            setModalState(() => saving = true);
                            try {
                              await StaffApiService.createProjectWorkItem(
                                employeeId: widget.user.id,
                                projectId: selectedProjectId,
                                title: titleCtrl.text.trim(),
                                description: descCtrl.text.trim(),
                                priority: priority,
                                dueDate: dueCtrl.text.trim().isEmpty ? null : dueCtrl.text.trim(),
                                token: widget.user.token,
                              );
                              if (ctx.mounted) Navigator.pop(ctx);
                              await _loadData();
                            } catch (e) {
                              setModalState(() => saving = false);
                              if (mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
                                );
                              }
                            }
                          },
                    child: Text(saving ? 'Creating...' : 'Create Task', style: const TextStyle(fontWeight: FontWeight.w700)),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _openHandoverSheet(Map<String, dynamic> project) {
    final summaryCtrl = TextEditingController();
    final deliverablesCtrl = TextEditingController();
    final techCtrl = TextEditingController();
    final repoCtrl = TextEditingController();
    bool saving = false;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
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
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Text(
                        'Submit Handover · ${project['name'] ?? 'Project'}',
                        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Color(0xFF0F172A)),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    IconButton(onPressed: () => Navigator.pop(ctx), icon: const Icon(Icons.close)),
                  ],
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: summaryCtrl,
                  maxLines: 2,
                  decoration: const InputDecoration(
                    labelText: 'Executive Summary of Completed Work',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: deliverablesCtrl,
                  maxLines: 3,
                  decoration: const InputDecoration(
                    labelText: 'Deliverables & Artifacts Produced',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: techCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Tools / Technologies (comma separated)',
                    hintText: 'Flutter, Next.js, PostgreSQL',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: repoCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Documentation / Repository Link (optional)',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: _brandColor,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    onPressed: saving
                        ? null
                        : () async {
                            if (summaryCtrl.text.trim().isEmpty) return;
                            setModalState(() => saving = true);
                            try {
                              final techs = techCtrl.text
                                  .split(',')
                                  .map((e) => e.trim())
                                  .where((e) => e.isNotEmpty)
                                  .toList();
                              await StaffApiService.submitProjectHandover(
                                employeeId: widget.user.id,
                                projectId: project['id'].toString(),
                                summary: summaryCtrl.text.trim(),
                                deliverables: deliverablesCtrl.text.trim(),
                                technologies: techs,
                                repoUrl: repoCtrl.text.trim(),
                                token: widget.user.token,
                              );
                              if (ctx.mounted) Navigator.pop(ctx);
                              if (mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(content: Text('Handover package submitted for Team Lead / GMD verification.')),
                                );
                              }
                              await _loadData();
                            } catch (e) {
                              setModalState(() => saving = false);
                              if (mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
                                );
                              }
                            }
                          },
                    child: Text(saving ? 'Submitting...' : 'Submit Handover Package', style: const TextStyle(fontWeight: FontWeight.w700)),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final openTasks = _workItems
        .where((w) => !['DONE', 'ACCEPTED', 'ARCHIVED'].contains((w['status'] ?? '').toString().toUpperCase()))
        .length;
    final slaAlerts = _projects.where((p) {
      final members = (p['members'] as List?) ?? [];
      return members.any((m) =>
          m['employeeId'] == widget.user.id &&
          ['OVERDUE', 'AT_RISK', 'COMPLETED_LATE'].contains((m['slaStatus'] ?? '').toString()));
    }).length;
    final pendingHandovers = _projects.where((p) {
      final handovers = (p['staffHandovers'] as List?) ?? [];
      final mine = handovers.cast<Map?>().firstWhere(
            (h) => h?['employeeId'] == widget.user.id,
            orElse: () => null,
          );
      return mine == null || mine['submissionStatus'] == 'PENDING';
    }).length;

    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        backgroundColor: Colors.white,
        foregroundColor: const Color(0xFF0F172A),
        elevation: 0,
        title: const Text(
          'Project Management System',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            tooltip: 'Refresh projects',
            onPressed: _loadData,
          ),
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: Center(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: const Color(0xFFECFDF5),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: const Color(0xFFA7F3D0)),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.circle, size: 7, color: Color(0xFF059669)),
                    SizedBox(width: 5),
                    Text('LIVE', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Color(0xFF047857))),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
      floatingActionButton: _tabIndex == 1
          ? FloatingActionButton.extended(
              backgroundColor: _brandColor,
              foregroundColor: Colors.white,
              onPressed: _openCreateTaskSheet,
              icon: const Icon(Icons.add_task_rounded),
              label: const Text('New Task', style: TextStyle(fontWeight: FontWeight.w700)),
            )
          : null,
      body: RefreshIndicator(
        onRefresh: _loadData,
        child: Column(
          children: [
            // Hero KPI Strip
            Container(
              color: Colors.white,
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
              child: Column(
                children: [
                  Row(
                    children: [
                      _kpiTile('PROJECTS', '${_projects.length}', _brandColor),
                      const SizedBox(width: 8),
                      _kpiTile('OPEN TASKS', '$openTasks', const Color(0xFF0284C7)),
                      const SizedBox(width: 8),
                      _kpiTile('SLA ALERTS', '$slaAlerts', slaAlerts > 0 ? const Color(0xFFDC2626) : const Color(0xFF059669)),
                      const SizedBox(width: 8),
                      _kpiTile('HANDOVERS', '$pendingHandovers', const Color(0xFFD97706)),
                    ],
                  ),
                  const SizedBox(height: 12),
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: [
                        _tabPill(0, 'Projects & Timelines', Icons.folder_copy_rounded),
                        const SizedBox(width: 8),
                        _tabPill(1, 'Tasks & Issues', Icons.checklist_rounded),
                        const SizedBox(width: 8),
                        _tabPill(2, 'Project Chat', Icons.forum_rounded),
                        const SizedBox(width: 8),
                        _tabPill(3, 'Handover & Vault', Icons.verified_user_rounded),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const Divider(height: 1, color: Color(0xFFE2E8F0)),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _error != null
                      ? Center(
                          child: Padding(
                            padding: const EdgeInsets.all(24),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(Icons.error_outline_rounded, size: 40, color: Color(0xFFDC2626)),
                                const SizedBox(height: 10),
                                Text(_error!, textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFF475569))),
                                const SizedBox(height: 14),
                                ElevatedButton(onPressed: _loadData, child: const Text('Retry')),
                              ],
                            ),
                          ),
                        )
                      : _buildActiveTab(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _kpiTile(String label, String value, Color accent) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 10),
        decoration: BoxDecoration(
          color: const Color(0xFFF8FAFC),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFFE2E8F0)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: const TextStyle(fontSize: 9.5, fontWeight: FontWeight.w800, color: Color(0xFF64748B))),
            const SizedBox(height: 3),
            Text(value, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: accent)),
          ],
        ),
      ),
    );
  }

  Widget _tabPill(int idx, String label, IconData icon) {
    final active = _tabIndex == idx;
    return InkWell(
      onTap: () => setState(() => _tabIndex = idx),
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: active ? _brandColor : const Color(0xFFF1F5F9),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 15, color: active ? Colors.white : const Color(0xFF475569)),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: active ? Colors.white : const Color(0xFF334155),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildActiveTab() {
    switch (_tabIndex) {
      case 0:
        return _buildProjectsTab();
      case 1:
        return _buildTasksTab();
      case 2:
        return _buildChatTab();
      case 3:
      default:
        return _buildHandoverTab();
    }
  }

  Widget _buildProjectsTab() {
    if (_projects.isEmpty) {
      return _emptyState(
        Icons.folder_open_rounded,
        'No Assigned Projects Yet',
        'Projects assigned to you by GMD, Super Admin, or your Team Lead will appear here with live timelines and SLA tracking.',
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: _projects.length,
      separatorBuilder: (_, __) => const SizedBox(height: 12),
      itemBuilder: (ctx, i) {
        final p = _projects[i] as Map<String, dynamic>;
        final members = (p['members'] as List?) ?? [];
        final myMember = members.cast<Map?>().firstWhere(
              (m) => m?['employeeId'] == widget.user.id,
              orElse: () => null,
            );
        final slaStatus = (myMember?['slaStatus'] ?? 'ON_TRACK').toString();
        final isDone = slaStatus == 'COMPLETED_ON_TIME' || slaStatus == 'COMPLETED_LATE';
        final slaColor = slaStatus == 'OVERDUE'
            ? const Color(0xFFDC2626)
            : slaStatus == 'AT_RISK'
                ? const Color(0xFFD97706)
                : const Color(0xFF059669);

        return Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: const Color(0xFFE2E8F0)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: _brandColor.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      '${p['projectCode'] ?? 'PRJ'} · ${p['status'] ?? 'ACTIVE'}',
                      style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: _brandColor),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: slaColor.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      slaStatus.replaceAll('_', ' '),
                      style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: slaColor),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                (p['name'] ?? 'Untitled Project').toString(),
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Color(0xFF0F172A)),
              ),
              if ((p['description'] ?? '').toString().isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  p['description'].toString(),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12.5, color: Color(0xFF475569)),
                ),
              ],
              const SizedBox(height: 10),
              Row(
                children: [
                  const Icon(Icons.calendar_today_rounded, size: 13, color: Color(0xFF64748B)),
                  const SizedBox(width: 6),
                  Text(
                    'Timeline: ${myMember?['assignedStartDate'] ?? p['startDate'] ?? 'TBD'} → ${myMember?['targetCompletionDate'] ?? p['endDate'] ?? 'TBD'}',
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF334155)),
                  ),
                ],
              ),
              if (myMember != null && !isDone) ...[
                const SizedBox(height: 12),
                Align(
                  alignment: Alignment.centerRight,
                  child: OutlinedButton.icon(
                    onPressed: () => _markDeliverableDone(myMember['id'].toString()),
                    icon: const Icon(Icons.check_circle_outline_rounded, size: 16),
                    label: const Text('Mark My Deliverable Done', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: const Color(0xFF059669),
                      side: const BorderSide(color: Color(0xFFA7F3D0)),
                      backgroundColor: const Color(0xFFECFDF5),
                    ),
                  ),
                ),
              ],
            ],
          ),
        );
      },
    );
  }

  Widget _buildTasksTab() {
    final statuses = ['ALL', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE'];
    final filtered = _workItems.where((w) {
      if (_taskStatusFilter == 'ALL') return true;
      return (w['status'] ?? '').toString().toUpperCase() == _taskStatusFilter;
    }).toList();

    return Column(
      children: [
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 6),
          child: Row(
            children: statuses.map((s) {
              final active = _taskStatusFilter == s;
              return Padding(
                padding: const EdgeInsets.only(right: 6),
                child: ChoiceChip(
                  label: Text(s.replaceAll('_', ' '), style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700)),
                  selected: active,
                  selectedColor: _brandColor.withOpacity(0.15),
                  onSelected: (_) => setState(() => _taskStatusFilter = s),
                ),
              );
            }).toList(),
          ),
        ),
        Expanded(
          child: filtered.isEmpty
              ? _emptyState(
                  Icons.task_alt_rounded,
                  'No Tasks in This View',
                  'Tap "+ New Task" below to log a work item on any of your assigned projects.',
                )
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 80),
                  itemCount: filtered.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (ctx, i) {
                    final t = filtered[i] as Map<String, dynamic>;
                    final status = (t['status'] ?? 'TODO').toString().toUpperCase();
                    final priority = (t['priority'] ?? 'MEDIUM').toString().toUpperCase();
                    return Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: const Color(0xFFE2E8F0)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                '${t['itemKey'] ?? 'TASK'} · $priority',
                                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: _brandColor),
                              ),
                              DropdownButton<String>(
                                value: ['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE'].contains(status) ? status : 'TODO',
                                isDense: true,
                                underline: const SizedBox.shrink(),
                                style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: Color(0xFF0F172A)),
                                items: const [
                                  DropdownMenuItem(value: 'BACKLOG', child: Text('Backlog')),
                                  DropdownMenuItem(value: 'TODO', child: Text('To Do')),
                                  DropdownMenuItem(value: 'IN_PROGRESS', child: Text('In Progress')),
                                  DropdownMenuItem(value: 'IN_REVIEW', child: Text('In Review')),
                                  DropdownMenuItem(value: 'BLOCKED', child: Text('Blocked')),
                                  DropdownMenuItem(value: 'DONE', child: Text('Done')),
                                ],
                                onChanged: (next) {
                                  if (next != null && next != status) {
                                    _updateTaskStatus(t['id'].toString(), next);
                                  }
                                },
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Text(
                            (t['title'] ?? 'Untitled Task').toString(),
                            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Color(0xFF0F172A)),
                          ),
                          if ((t['dueDate'] ?? '').toString().isNotEmpty) ...[
                            const SizedBox(height: 6),
                            Text(
                              'Due: ${t['dueDate'].toString().split('T').first}',
                              style: const TextStyle(fontSize: 11.5, color: Color(0xFF64748B)),
                            ),
                          ],
                        ],
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }

  Widget _buildChatTab() {
    if (_projects.isEmpty) {
      return _emptyState(Icons.forum_outlined, 'No Project Channels', 'Join or get assigned to a project to chat with your team.');
    }
    return Column(
      children: [
        Container(
          color: Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: DropdownButtonFormField<String>(
            value: _selectedChatProjectId,
            decoration: const InputDecoration(
              labelText: 'Active Project Channel',
              border: OutlineInputBorder(),
              isDense: true,
            ),
            items: _projects.map<DropdownMenuItem<String>>((p) {
              return DropdownMenuItem(
                value: p['id'].toString(),
                child: Text('${p['projectCode'] ?? ''} · ${p['name'] ?? 'Project'}', overflow: TextOverflow.ellipsis),
              );
            }).toList(),
            onChanged: (v) {
              if (v != null) {
                setState(() => _selectedChatProjectId = v);
                _loadChat(v);
              }
            },
          ),
        ),
        Expanded(
          child: _loadingChat
              ? const Center(child: CircularProgressIndicator())
              : _chatMessages.isEmpty
                  ? _emptyState(Icons.chat_bubble_outline_rounded, 'No Messages Yet', 'Start the conversation with your project team below.')
                  : ListView.separated(
                      padding: const EdgeInsets.all(16),
                      itemCount: _chatMessages.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (ctx, i) {
                        final m = _chatMessages[i] as Map<String, dynamic>;
                        final isMe = m['senderId'] == widget.user.id;
                        return Align(
                          alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
                          child: Container(
                            constraints: const BoxConstraints(maxWidth: 320),
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: isMe ? _brandColor.withOpacity(0.12) : Colors.white,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: isMe ? _brandColor.withOpacity(0.35) : const Color(0xFFE2E8F0)),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  (m['senderName'] ?? m['sender']?['legalName'] ?? 'Team Member').toString(),
                                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: isMe ? _brandColor : const Color(0xFF334155)),
                                ),
                                const SizedBox(height: 4),
                                Text((m['content'] ?? '').toString(), style: const TextStyle(fontSize: 13, color: Color(0xFF0F172A))),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
        ),
        Container(
          color: Colors.white,
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 16),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _chatCtrl,
                  decoration: const InputDecoration(
                    hintText: 'Write an update to the project team...',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                  onSubmitted: (_) => _sendChat(),
                ),
              ),
              const SizedBox(width: 8),
              IconButton(
                onPressed: _sendingChat ? null : _sendChat,
                style: IconButton.styleFrom(backgroundColor: _brandColor, foregroundColor: Colors.white),
                icon: const Icon(Icons.send_rounded, size: 18),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildHandoverTab() {
    if (_projects.isEmpty) {
      return _emptyState(Icons.verified_user_outlined, 'No Handover Packages', 'Assigned projects will appear here so you can submit deliverables and handover documentation.');
    }
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: _projects.length,
      separatorBuilder: (_, __) => const SizedBox(height: 12),
      itemBuilder: (ctx, i) {
        final p = _projects[i] as Map<String, dynamic>;
        final handovers = (p['staffHandovers'] as List?) ?? [];
        final mine = handovers.cast<Map?>().firstWhere(
              (h) => h?['employeeId'] == widget.user.id,
              orElse: () => null,
            );
        final status = (mine?['submissionStatus'] ?? 'PENDING').toString();
        final isVerified = status == 'VERIFIED';

        return Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: const Color(0xFFE2E8F0)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Text(
                      (p['name'] ?? 'Project').toString(),
                      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Color(0xFF0F172A)),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: isVerified ? const Color(0xFFECFDF5) : const Color(0xFFFFFBEB),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      status,
                      style: TextStyle(
                        fontSize: 10.5,
                        fontWeight: FontWeight.w800,
                        color: isVerified ? const Color(0xFF047857) : const Color(0xFFB45309),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                mine != null && (mine['summary'] ?? '').toString().isNotEmpty
                    ? mine['summary'].toString()
                    : 'No handover package submitted yet for this project.',
                style: const TextStyle(fontSize: 12.5, color: Color(0xFF475569)),
              ),
              const SizedBox(height: 12),
              Align(
                alignment: Alignment.centerRight,
                child: ElevatedButton.icon(
                  onPressed: () => _openHandoverSheet(p),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _brandColor,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  icon: const Icon(Icons.upload_file_rounded, size: 16),
                  label: Text(mine == null ? 'Submit Handover' : 'Update Handover', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _emptyState(IconData icon, String title, String subtitle) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 42, color: const Color(0xFF94A3B8)),
            const SizedBox(height: 10),
            Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Color(0xFF0F172A))),
            const SizedBox(height: 6),
            Text(subtitle, textAlign: TextAlign.center, style: const TextStyle(fontSize: 12.5, color: Color(0xFF64748B))),
          ],
        ),
      ),
    );
  }
}
