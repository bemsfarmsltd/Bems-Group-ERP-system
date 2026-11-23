import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../models/staff_models.dart';
import '../../services/staff_api_service.dart';

class StaffInnovationScreen extends StatefulWidget {
  final StaffUser user;

  const StaffInnovationScreen({super.key, required this.user});

  @override
  State<StaffInnovationScreen> createState() => _StaffInnovationScreenState();
}

class _StaffInnovationScreenState extends State<StaffInnovationScreen> {
  static const _offlineQueueKey = 'bems_innovation_offline_drafts_v1';

  int _tabIndex = 0; // 0: Home, 1: My Products & Board, 2: Submit Idea & Voting, 3: Brainstorm Canvas, 4: Research & Feedback
  bool _loading = true;
  String? _error;

  Map<String, dynamic> _summary = {};
  List<dynamic> _myProducts = [];
  List<dynamic> _ideaBoard = [];
  List<dynamic> _boards = [];
  List<dynamic> _features = [];
  List<dynamic> _assignedResearch = [];
  List<dynamic> _prds = [];
  List<dynamic> _contributions = [];
  List<Map<String, dynamic>> _offlineDrafts = [];

  final TextEditingController _ideaTitleCtrl = TextEditingController();
  final TextEditingController _ideaProblemCtrl = TextEditingController();
  final TextEditingController _ideaValueCtrl = TextEditingController();
  final TextEditingController _stickyNoteCtrl = TextEditingController();
  final TextEditingController _fbTitleCtrl = TextEditingController();
  final TextEditingController _fbDescCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadOfflineQueue();
    _loadInbox();
  }

  @override
  void dispose() {
    _ideaTitleCtrl.dispose();
    _ideaProblemCtrl.dispose();
    _ideaValueCtrl.dispose();
    _stickyNoteCtrl.dispose();
    _fbTitleCtrl.dispose();
    _fbDescCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadOfflineQueue() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_offlineQueueKey);
    if (raw != null && raw.isNotEmpty) {
      try {
        final decoded = jsonDecode(raw);
        if (decoded is List && mounted) {
          setState(() {
            _offlineDrafts = decoded.map((e) => Map<String, dynamic>.from(e as Map)).toList();
          });
        }
      } catch (_) {}
    }
  }

  Future<void> _saveOfflineQueue(List<Map<String, dynamic>> drafts) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_offlineQueueKey, jsonEncode(drafts));
    if (mounted) setState(() => _offlineDrafts = drafts);
  }

  Future<void> _syncOfflineDrafts() async {
    if (_offlineDrafts.isEmpty) return;
    try {
      await StaffApiService.syncInnovationDrafts(
        employeeId: widget.user.id,
        drafts: _offlineDrafts,
        token: widget.user.token,
      );
      await _saveOfflineQueue([]);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Offline product drafts synchronized with zero duplicates.')),
      );
      await _loadInbox();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Sync retry needed: ${e.toString().replaceFirst('Exception: ', '')}')),
      );
    }
  }

  Future<void> _loadInbox() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await StaffApiService.fetchInnovationInbox(
        employeeId: widget.user.id,
        token: widget.user.token,
      );
      if (!mounted) return;
      setState(() {
        _summary = (data['summary'] as Map<String, dynamic>?) ?? {};
        _myProducts = (data['myProducts'] as List?) ?? [];
        _ideaBoard = (data['ideaBoard'] as List?) ?? [];
        _boards = (data['boards'] as List?) ?? [];
        _features = (data['features'] as List?) ?? [];
        _assignedResearch = (data['assignedResearch'] as List?) ?? [];
        _prds = (data['prds'] as List?) ?? [];
        _contributions = (data['contributions'] as List?) ?? [];
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _submitIdea() async {
    final title = _ideaTitleCtrl.text.trim();
    final problem = _ideaProblemCtrl.text.trim();
    if (title.isEmpty || problem.isEmpty) return;

    final payload = {
      'clientSubmissionId': 'flutter-idea-${DateTime.now().millisecondsSinceEpoch}',
      'productId': _myProducts.isNotEmpty ? _myProducts.first['id'] : null,
      'title': title,
      'problemStatement': problem,
      'description': problem,
      'expectedValue': _ideaValueCtrl.text.trim(),
      'type': 'IDEA',
    };

    try {
      final res = await StaffApiService.submitProductIdea(
        employeeId: widget.user.id,
        payload: payload,
        token: widget.user.token,
      );
      _ideaTitleCtrl.clear();
      _ideaProblemCtrl.clear();
      _ideaValueCtrl.clear();
      if (!mounted) return;
      final ideaNum = res['idea']?['ideaNumber'] ?? 'IDEA';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Idea submitted! Reference: $ideaNum')),
      );
      await _loadInbox();
    } catch (_) {
      final next = [..._offlineDrafts, payload];
      await _saveOfflineQueue(next);
      _ideaTitleCtrl.clear();
      _ideaProblemCtrl.clear();
      _ideaValueCtrl.clear();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Offline: Idea saved locally for idempotent sync.')),
      );
    }
  }

  Future<void> _voteIdea(String ideaId) async {
    try {
      await StaffApiService.patchProductIdea(
        employeeId: widget.user.id,
        ideaId: ideaId,
        action: 'VOTE',
        token: widget.user.token,
      );
      await _loadInbox();
    } catch (_) {}
  }

  Future<void> _addCanvasSticky(String boardId) async {
    final text = _stickyNoteCtrl.text.trim();
    if (text.isEmpty) return;
    try {
      await StaffApiService.postCanvasAction(
        employeeId: widget.user.id,
        payload: {
          'action': 'ADD_OBJECT',
          'boardId': boardId,
          'objectType': 'STICKY',
          'content': text,
          'color': '#FEF08A',
          'clusterTag': 'SOLUTION',
        },
        token: widget.user.token,
      );
      _stickyNoteCtrl.clear();
      await _loadInbox();
    } catch (_) {}
  }

  Future<void> _convertCanvasStickyToIdea(String objectId) async {
    try {
      final res = await StaffApiService.postCanvasAction(
        employeeId: widget.user.id,
        payload: {
          'action': 'CONVERT_OBJECT',
          'objectId': objectId,
          'targetType': 'IDEA',
        },
        token: widget.user.token,
      );
      if (!mounted) return;
      final code = res['object']?['convertedCode'] ?? 'IDEA';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Converted canvas note to $code with source provenance.')),
      );
      await _loadInbox();
    } catch (_) {}
  }

  Future<void> _submitFeedback() async {
    final title = _fbTitleCtrl.text.trim();
    final desc = _fbDescCtrl.text.trim();
    if (title.isEmpty || desc.isEmpty) return;
    try {
      await StaffApiService.postDiscoveryAction(
        employeeId: widget.user.id,
        payload: {
          'entityType': 'FEEDBACK',
          'category': 'FEATURE_REQUEST',
          'title': title,
          'description': desc,
        },
        token: widget.user.token,
      );
      _fbTitleCtrl.clear();
      _fbDescCtrl.clear();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Product feedback recorded.')),
      );
      await _loadInbox();
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        backgroundColor: Colors.white,
        foregroundColor: const Color(0xFF0F172A),
        elevation: 0.5,
        title: const Text(
          'Product Management & Innovation',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: Color(0xFF0F172A)),
        ),
        actions: [
          if (_offlineDrafts.isNotEmpty)
            TextButton.icon(
              onPressed: _syncOfflineDrafts,
              icon: const Icon(Icons.cloud_upload_outlined, size: 16, color: Color(0xFFEA580C)),
              label: Text(
                'Sync (${_offlineDrafts.length})',
                style: const TextStyle(color: Color(0xFFEA580C), fontWeight: FontWeight.w800, fontSize: 12),
              ),
            ),
          IconButton(
            onPressed: _loadInbox,
            icon: const Icon(Icons.refresh_rounded, size: 20),
          ),
        ],
      ),
      body: Column(
        children: [
          // Top Navigation Pills
          Container(
            color: Colors.white,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  _buildNavChip(0, 'Product Home'),
                  const SizedBox(width: 6),
                  _buildNavChip(1, 'My Products & Board (${_myProducts.length})'),
                  const SizedBox(width: 6),
                  _buildNavChip(2, 'Submit Idea & Vote (${_ideaBoard.length})'),
                  const SizedBox(width: 6),
                  _buildNavChip(3, 'Brainstorm Canvas (${_boards.length})'),
                  const SizedBox(width: 6),
                  _buildNavChip(4, 'Research & Contributions'),
                ],
              ),
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: Color(0xFFEA580C)))
                : _error != null
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Text(_error!, style: const TextStyle(color: Color(0xFFDC2626))),
                        ),
                      )
                    : SingleChildScrollView(
                        padding: const EdgeInsets.all(16),
                        child: _buildActiveView(),
                      ),
          ),
        ],
      ),
    );
  }

  Widget _buildNavChip(int index, String label) {
    final active = _tabIndex == index;
    return InkWell(
      onTap: () => setState(() => _tabIndex = index),
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
        decoration: BoxDecoration(
          color: active ? const Color(0xFFEA580C) : const Color(0xFFF8FAFC),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: active ? const Color(0xFFEA580C) : const Color(0xFFE2E8F0)),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w800,
            color: active ? Colors.white : const Color(0xFF334155),
          ),
        ),
      ),
    );
  }

  Widget _buildActiveView() {
    switch (_tabIndex) {
      case 1:
        return _buildProductsAndFeaturesView();
      case 2:
        return _buildIdeaSubmissionAndVotingView();
      case 3:
        return _buildBrainstormCanvasView();
      case 4:
        return _buildResearchAndContributionsView();
      default:
        return _buildHomeView();
    }
  }

  Widget _buildHomeView() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: const Color(0xFFE2E8F0)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Welcome, ${widget.user.fullName}',
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: Color(0xFF0F172A)),
              ),
              const SizedBox(height: 4),
              const Text(
                'Contribute product ideas, collaborate on shared brainstorming boards, and track product roadmaps & PRDs.',
                style: TextStyle(fontSize: 12, color: Color(0xFF64748B)),
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  ElevatedButton.icon(
                    onPressed: () => setState(() => _tabIndex = 2),
                    icon: const Icon(Icons.lightbulb_outline, size: 16),
                    label: const Text('Submit Idea'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFFEA580C),
                      foregroundColor: Colors.white,
                    ),
                  ),
                  OutlinedButton.icon(
                    onPressed: () => setState(() => _tabIndex = 3),
                    icon: const Icon(Icons.dashboard_customize_outlined, size: 16),
                    label: const Text('Join Brainstorming'),
                  ),
                  OutlinedButton.icon(
                    onPressed: () => setState(() => _tabIndex = 1),
                    icon: const Icon(Icons.view_kanban_outlined, size: 16),
                    label: const Text('Product Board'),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        ..._myProducts.map((p) => Container(
              margin: const EdgeInsets.only(bottom: 10),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFFE2E8F0)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        '${p['productCode']} · ${p['lifecycleStage']}',
                        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900, color: Color(0xFFEA580C)),
                      ),
                      Text(
                        'Role: ${p['myRole']}',
                        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Color(0xFF047857)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    p['name']?.toString() ?? 'Product',
                    style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w900, color: Color(0xFF0F172A)),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    p['summary']?.toString() ?? '',
                    style: const TextStyle(fontSize: 12, color: Color(0xFF475569)),
                  ),
                ],
              ),
            )),
      ],
    );
  }

  Widget _buildProductsAndFeaturesView() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text(
          'Product Features & Approved PRDs',
          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: Color(0xFF0F172A)),
        ),
        const SizedBox(height: 10),
        ..._features.map((f) => Container(
              margin: const EdgeInsets.only(bottom: 10),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFFE2E8F0)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        '${f['featureCode']} · ${f['productName']}',
                        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900, color: Color(0xFFEA580C)),
                      ),
                      Text(
                        f['workflowStage']?.toString() ?? 'IDEA',
                        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Color(0xFF1D4ED8)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    f['title']?.toString() ?? '',
                    style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: Color(0xFF0F172A)),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    f['problemStatement']?.toString() ?? '',
                    style: const TextStyle(fontSize: 12, color: Color(0xFF475569)),
                  ),
                ],
              ),
            )),
        const SizedBox(height: 12),
        ..._prds.map((prd) => Container(
              margin: const EdgeInsets.only(bottom: 10),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFFE2E8F0)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${prd['prdCode']} · v${prd['currentVersion']} (${prd['status']})',
                    style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900, color: Color(0xFF047857)),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    prd['title']?.toString() ?? '',
                    style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    prd['overview']?.toString() ?? '',
                    style: const TextStyle(fontSize: 12, color: Color(0xFF475569)),
                  ),
                ],
              ),
            )),
      ],
    );
  }

  Widget _buildIdeaSubmissionAndVotingView() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: const Color(0xFFE2E8F0)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Submit New Product Idea (Idempotent & Offline-Safe)',
                style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w900, color: Color(0xFF0F172A)),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _ideaTitleCtrl,
                decoration: const InputDecoration(
                  labelText: 'Idea Title *',
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _ideaProblemCtrl,
                maxLines: 2,
                decoration: const InputDecoration(
                  labelText: 'User Problem / Pain Point *',
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _ideaValueCtrl,
                decoration: const InputDecoration(
                  labelText: 'Expected Value / Outcome',
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
              ),
              const SizedBox(height: 10),
              ElevatedButton(
                onPressed: _submitIdea,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFEA580C),
                  foregroundColor: Colors.white,
                ),
                child: const Text('Submit Idea'),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        const Text(
          'Company Idea Board & Voting',
          style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w900, color: Color(0xFF0F172A)),
        ),
        const SizedBox(height: 8),
        ..._ideaBoard.map((idea) => Container(
              margin: const EdgeInsets.only(bottom: 10),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFFE2E8F0)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        '${idea['ideaNumber']} · ${idea['status']}',
                        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900, color: Color(0xFFEA580C)),
                      ),
                      TextButton.icon(
                        onPressed: () => _voteIdea(idea['id'].toString()),
                        icon: const Icon(Icons.thumb_up_alt_outlined, size: 14, color: Color(0xFFEA580C)),
                        label: Text('${idea['votesCount'] ?? 1}'),
                      ),
                    ],
                  ),
                  Text(
                    idea['title']?.toString() ?? '',
                    style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    idea['problemStatement']?.toString() ?? '',
                    style: const TextStyle(fontSize: 12, color: Color(0xFF475569)),
                  ),
                ],
              ),
            )),
      ],
    );
  }

  Widget _buildBrainstormCanvasView() {
    if (_boards.isEmpty) {
      return const Text('No active brainstorming boards available.');
    }
    final board = _boards.first as Map<String, dynamic>;
    final objects = (board['objects'] as List?) ?? [];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: const Color(0xFFE2E8F0)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${board['boardCode']} · ${board['title']}',
                style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 4),
              Text(
                board['agenda']?.toString() ?? '',
                style: const TextStyle(fontSize: 11.5, color: Color(0xFF64748B)),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _stickyNoteCtrl,
                      decoration: const InputDecoration(
                        hintText: 'Add a sticky note to the live canvas...',
                        border: OutlineInputBorder(),
                        isDense: true,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  ElevatedButton(
                    onPressed: () => _addCanvasSticky(board['id'].toString()),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFFEA580C),
                      foregroundColor: Colors.white,
                    ),
                    child: const Text('+ Post'),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        ...objects.map((obj) => Container(
              margin: const EdgeInsets.only(bottom: 10),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: const Color(0xFFFEF9C3),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFFFACC15)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        '${obj['clusterTag'] ?? obj['objectType']} · by ${obj['creatorName'] ?? 'Staff'}',
                        style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: Color(0xFF475569)),
                      ),
                      if (obj['convertedCode'] != null)
                        Text(
                          'Linked: ${obj['convertedCode']}',
                          style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w900, color: Color(0xFF047857)),
                        ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    obj['content']?.toString() ?? '',
                    style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: Color(0xFF0F172A)),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      TextButton.icon(
                        onPressed: () async {
                          await StaffApiService.voteCanvasObject(
                            employeeId: widget.user.id,
                            objectId: obj['id'].toString(),
                            token: widget.user.token,
                          );
                          await _loadInbox();
                        },
                        icon: const Icon(Icons.thumb_up_alt_outlined, size: 14, color: Color(0xFFEA580C)),
                        label: Text('Vote (${obj['votesCount'] ?? 0})'),
                      ),
                      TextButton(
                        onPressed: () => _convertCanvasStickyToIdea(obj['id'].toString()),
                        child: const Text('→ Convert to Idea'),
                      ),
                    ],
                  ),
                ],
              ),
            )),
      ],
    );
  }

  Widget _buildResearchAndContributionsView() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: const Color(0xFFE2E8F0)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Submit Product Feedback or Defect Report',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _fbTitleCtrl,
                decoration: const InputDecoration(labelText: 'Summary', border: OutlineInputBorder(), isDense: true),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _fbDescCtrl,
                maxLines: 2,
                decoration: const InputDecoration(labelText: 'Details & Expected Outcome', border: OutlineInputBorder(), isDense: true),
              ),
              const SizedBox(height: 8),
              ElevatedButton(
                onPressed: _submitFeedback,
                style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF0F172A), foregroundColor: Colors.white),
                child: const Text('Submit Feedback'),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        const Text(
          'My Product Contribution History',
          style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w900),
        ),
        const SizedBox(height: 8),
        ..._contributions.map((c) => Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0xFFE2E8F0)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${c['code']} · ${c['status']}',
                    style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900, color: Color(0xFFEA580C)),
                  ),
                  Text(
                    c['title']?.toString() ?? '',
                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800),
                  ),
                ],
              ),
            )),
      ],
    );
  }
}
